import asyncio
from dataclasses import dataclass

import httpx
import websockets
from sqlmodel import select

from database import get_async_session
from logger import get_logger
from model.sandbox.containers import SandboxContainer
from schema.sandbox.containers import SandboxContainerStatus
from service.sandbox.docker_ops import (
    docker_status_to_sandbox_status,
    inspect_container_ip_sync,
    inspect_container_state_sync,
)
from service.sandbox.status import save_sandbox_container_status


logger = get_logger(__name__)

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _http_client


async def close_novnc_http_client() -> None:
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


@dataclass(frozen=True)
class NoVNCTarget:
    addr: str
    port: int
    container_hash: str


async def resolve_novnc_target(container_hash: str) -> NoVNCTarget | None:
    async with get_async_session() as session:
        result = await session.exec(
            select(SandboxContainer).where(SandboxContainer.container_hash == container_hash)
        )
        container = result.first()
        if container is None:
            return None
        if container.status != SandboxContainerStatus.RUNNING:
            return None
        if not container.novnc_support or container.novnc_port <= 0:
            return None

        novnc_port = container.novnc_port
        container_id = container.id

    state = await asyncio.to_thread(inspect_container_state_sync, container_hash)
    status = SandboxContainerStatus.ERROR if not state.exists else docker_status_to_sandbox_status(state.status)
    if status != SandboxContainerStatus.RUNNING:
        await save_sandbox_container_status(container_id, status)
        return None

    ip = await asyncio.to_thread(inspect_container_ip_sync, container_hash)
    if not ip:
        return None

    return NoVNCTarget(addr=ip, port=novnc_port, container_hash=container_hash)


async def proxy_novnc_http(target: NoVNCTarget, path: str) -> httpx.Response | None:
    url = f"http://{target.addr}:{target.port}/novnc/{path}"
    try:
        response = await _get_http_client().get(url)
        return response
    except (httpx.HTTPError, OSError):
        logger.debug("novnc http proxy failed: %s -> %s", target.container_hash, url, exc_info=True)
        return None


async def proxy_novnc_websocket(
    target: NoVNCTarget,
    receive_from_client,
    send_to_client,
    client_connected,
    subprotocols: list[str] | None = None,
) -> None:
    url = f"ws://{target.addr}:{target.port}/websockify"
    try:
        async with websockets.connect(
            url,
            subprotocols=subprotocols or [],
            max_size=2**20,
            open_timeout=10,
            close_timeout=5,
        ) as upstream:
            await _bidirectional_ws_forward(
                upstream, receive_from_client, send_to_client, client_connected
            )
    except (websockets.exceptions.WebSocketException, OSError, asyncio.CancelledError):
        logger.debug("novnc ws proxy ended: %s", target.container_hash, exc_info=True)


async def _bidirectional_ws_forward(upstream, receive_from_client, send_to_client, client_connected):
    async def forward_upstream_to_client():
        try:
            async for message in upstream:
                if not client_connected():
                    return
                await send_to_client(message)
        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            pass

    async def forward_client_to_upstream():
        try:
            while client_connected():
                data = await receive_from_client()
                if data is None:
                    return
                await upstream.send(data)
        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            pass

    upstream_task = asyncio.create_task(forward_upstream_to_client())
    client_task = asyncio.create_task(forward_client_to_upstream())
    try:
        await asyncio.wait(
            {upstream_task, client_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        for task in (upstream_task, client_task):
            if not task.done():
                task.cancel()
        for task in (upstream_task, client_task):
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
