import asyncio
import json
from http import HTTPStatus
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect, status as ws_status
from fastapi.websockets import WebSocketState

from handler import cancel_ws_task as _cancel_task, close_ws_silently as _close_silently
from logger import get_logger
from middleware.auth import decode_access_token
from schema.common.responses import CommonResponse
from schema.host.hosts import (
    CreateManagedHostRequest,
    DeleteManagedHostResponse,
    ManagedHostSchema,
    QueryManagedHostsResponse,
    UpdateManagedHostRequest,
)
from schema.system_user.users import SystemUserRole
from service.common.pagination import paginated_payload
from service.host.hosts import (
    create_managed_host,
    delete_managed_host,
    query_managed_hosts,
    update_managed_host,
)
from service.host.shell import (
    HostShellSession,
    open_host_shell,
    read_host_shell,
    resize_host_shell,
    resolve_shell_host,
    write_host_shell,
)


logger = get_logger(__name__)


async def create_managed_host_handler(request: CreateManagedHostRequest) -> CommonResponse:
    host = await create_managed_host(
        ip_address=request.ip_address,
        ssh_port=request.ssh_port,
        host_account=request.host_account,
        host_password=request.host_password,
        docker_management_port=request.docker_management_port,
    )
    return CommonResponse(data=ManagedHostSchema.model_validate(host))


async def update_managed_host_handler(id: int, request: UpdateManagedHostRequest) -> CommonResponse:
    host = await update_managed_host(
        id=id,
        ip_address=request.ip_address,
        ssh_port=request.ssh_port,
        host_account=request.host_account,
        host_password=request.host_password,
        docker_management_port=request.docker_management_port,
    )
    if host is None:
        return CommonResponse(code=HTTPStatus.NOT_FOUND.value, message="managed host not found")
    return CommonResponse(data=ManagedHostSchema.model_validate(host))


async def delete_managed_host_handler(id: int) -> CommonResponse:
    result = await delete_managed_host(id)
    if result.not_found:
        return CommonResponse(code=HTTPStatus.NOT_FOUND.value, message="managed host not found")
    if not result.deleted:
        return CommonResponse(code=HTTPStatus.BAD_REQUEST.value, message=result.message)
    return CommonResponse(data=DeleteManagedHostResponse(id=id))


async def query_managed_hosts_handler(page: int, size: int, keyword: str) -> CommonResponse:
    hosts = await query_managed_hosts(page=page, size=size, keyword=keyword)
    return CommonResponse(data=QueryManagedHostsResponse(
        **paginated_payload(
            hosts,
            [ManagedHostSchema.model_validate(host) for host in hosts.items],
        ),
    ))


async def handle_host_shell_stream(websocket: WebSocket, id: int, token: str) -> None:
    user = _authenticate_ws_token(token)
    if user is None or user.role != SystemUserRole.ADMIN:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    host = await resolve_shell_host(id)
    if host is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    shell: HostShellSession | None = None
    reader: asyncio.Task | None = None
    receiver: asyncio.Task | None = None

    try:
        try:
            shell = await open_host_shell(host)
        except Exception as exc:
            logger.warning(
                "host shell connection failed: id=%s target=%s:%s error=%s",
                id,
                host.ip_address,
                host.ssh_port,
                str(exc).strip() or exc.__class__.__name__,
            )
            await _send_shell_error(websocket, exc)
            await _close_silently(websocket, ws_status.WS_1011_INTERNAL_ERROR)
            return

        reader = asyncio.create_task(_forward_shell_output(websocket, shell))

        while True:
            receiver = asyncio.create_task(websocket.receive_text())
            done, _ = await asyncio.wait(
                {receiver, reader},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if reader in done:
                await reader
                await _close_silently(websocket, ws_status.WS_1000_NORMAL_CLOSURE)
                return

            message = receiver.result()
            receiver = None
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await write_host_shell(shell, message)
                continue

            if not isinstance(payload, dict):
                continue
            message_type = payload.get("type")
            if message_type == "input":
                await write_host_shell(shell, str(payload.get("data", "")))
            elif message_type == "resize":
                rows = _bounded_int(payload.get("rows"), default=24, minimum=1, maximum=300)
                cols = _bounded_int(payload.get("cols"), default=80, minimum=1, maximum=500)
                await resize_host_shell(shell, rows=rows, cols=cols)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("host shell stream failed: %s", id)
        await _close_silently(websocket)
    finally:
        try:
            if shell is not None:
                shell.shutdown()
            await _cancel_task(receiver)
            await _finish_reader_task(reader)
        finally:
            if shell is not None:
                await shell.close()


async def _forward_shell_output(websocket: WebSocket, shell: HostShellSession) -> None:
    while True:
        data = await read_host_shell(shell)
        if not data:
            return
        if websocket.client_state != WebSocketState.CONNECTED or websocket.application_state != WebSocketState.CONNECTED:
            return
        await websocket.send_bytes(data)


async def _send_shell_error(websocket: WebSocket, error: Exception) -> None:
    if websocket.client_state != WebSocketState.CONNECTED or websocket.application_state != WebSocketState.CONNECTED:
        return
    message = str(error).strip() or error.__class__.__name__
    await websocket.send_bytes(f"\r\nSSH connection failed: {message}\r\n".encode())


async def _finish_reader_task(task: asyncio.Task | None) -> None:
    if task is None:
        return
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=1)
    except asyncio.TimeoutError:
        await _cancel_task(task)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("host shell reader stopped with error", exc_info=True)


def _authenticate_ws_token(token: str):
    try:
        return decode_access_token(token)
    except Exception:
        return None


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(number, maximum))
