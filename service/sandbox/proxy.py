import asyncio
from dataclasses import dataclass

import httpx
from sqlmodel import select

from database import get_async_session
from model.egress_proxy.proxies import EgressProxy
from model.host.hosts import ManagedHost
from model.sandbox.containers import SandboxContainer
from schema.sandbox.containers import SandboxContainerStatus
from service.egress_proxy.proxies import (
    egress_proxy_container_environment,
    egress_proxy_runtime_environment,
)


_http_client: httpx.AsyncClient | None = None
_EGRESS_PROXY_APPLY_ATTEMPTS = 3
_EGRESS_PROXY_APPLY_RETRY_SECONDS = 0.5


@dataclass(frozen=True)
class SandboxProxyTarget:
    container_id: int
    base_url: str
    ws_base_url: str
    token: str
    status: SandboxContainerStatus
    novnc_support: bool


async def resolve_sandbox_proxy_target(
    container_id: int,
    *,
    require_running: bool = False,
    require_novnc: bool = False,
) -> SandboxProxyTarget | None:
    async with get_async_session() as session:
        row = (await session.exec(
            select(SandboxContainer, ManagedHost)
            .join(ManagedHost, SandboxContainer.host_id == ManagedHost.id)
            .where(SandboxContainer.id == container_id)
        )).first()
        if row is None:
            return None
        container, host = row

    if container.proxy_host_port <= 0 or not container.proxy_token:
        return None
    if require_running and container.status != SandboxContainerStatus.RUNNING:
        return None
    if require_novnc and not container.novnc_support:
        return None

    base = f"http://{host.ip_address}:{container.proxy_host_port}"
    return SandboxProxyTarget(
        container_id=container.id or container_id,
        base_url=base,
        ws_base_url=f"ws://{host.ip_address}:{container.proxy_host_port}",
        token=container.proxy_token,
        status=container.status,
        novnc_support=container.novnc_support,
    )


def sandbox_proxy_token_headers(target: SandboxProxyTarget) -> dict[str, str]:
    return {"X-Sandbox-Token": target.token}


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0), trust_env=False)
    return _http_client


async def close_proxy_http_client() -> None:
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


async def resolve_container_egress_proxy_runtime_environment(container_id: int) -> dict[str, str]:
    return egress_proxy_runtime_environment()


async def resolve_container_egress_proxy_environment(container_id: int) -> dict[str, str]:
    async with get_async_session() as session:
        row = (await session.exec(
            select(EgressProxy)
            .join(SandboxContainer, SandboxContainer.egress_proxy_id == EgressProxy.id)
            .where(SandboxContainer.id == container_id)
        )).first()
    return egress_proxy_container_environment(row)


async def apply_container_egress_proxy(container_id: int) -> None:
    target = await resolve_sandbox_proxy_target(container_id, require_running=True)
    if target is None:
        raise ValueError("sandbox container is not running")
    environment = await resolve_container_egress_proxy_environment(container_id)
    await apply_egress_proxy_environment(target, environment)


async def apply_egress_proxy_to_running_containers(egress_proxy_id: int) -> list[int]:
    async with get_async_session() as session:
        container_ids = list((await session.exec(
            select(SandboxContainer.id)
            .where(SandboxContainer.egress_proxy_id == egress_proxy_id)
            .where(SandboxContainer.status == SandboxContainerStatus.RUNNING)
        )).all())

    failed: list[int] = []
    for container_id in container_ids:
        if container_id is None:
            continue
        try:
            await apply_container_egress_proxy(container_id)
        except Exception:
            failed.append(container_id)
    return failed


async def apply_egress_proxy_environment(target: SandboxProxyTarget, environment: dict[str, str] | None) -> None:
    payload = {"environment": environment or egress_proxy_runtime_environment()}
    last_error: Exception | None = None
    for attempt in range(_EGRESS_PROXY_APPLY_ATTEMPTS):
        try:
            response = await _get_http_client().post(
                f"{target.base_url}/egress-proxy",
                json=payload,
                headers=sandbox_proxy_token_headers(target),
            )
            response.raise_for_status()
            return
        except (httpx.HTTPError, OSError) as exc:
            last_error = exc
            if attempt < _EGRESS_PROXY_APPLY_ATTEMPTS - 1:
                await asyncio.sleep(_EGRESS_PROXY_APPLY_RETRY_SECONDS)
    if last_error is not None:
        raise last_error
