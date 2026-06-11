import asyncio
import json
from http import HTTPStatus
from typing import Any
from urllib.parse import quote

from fastapi import UploadFile, WebSocket, WebSocketDisconnect, status as ws_status
from fastapi.responses import JSONResponse, Response as FastAPIResponse, StreamingResponse
from fastapi.websockets import WebSocketState
from sqlmodel import select as _select

from database import get_async_session
from handler import cancel_ws_task as _cancel_task, close_ws_silently as _close_silently
from logger import get_logger
from middleware.auth import decode_access_token
from model.sandbox.containers import SandboxContainer
from schema.common.responses import CommonResponse
from schema.sandbox.containers import (
    ContainerFileCopyRequest,
    ContainerFileDeleteRequest,
    ContainerFileMkdirRequest,
    ContainerFileMoveRequest,
    ContainerFileReadResponse,
    ContainerFileUploadResponse,
    ContainerFileType,
    ContainerFileWriteRequest,
    CreateSandboxContainerRequest,
    DeleteSandboxContainerResponse,
    ListContainerFilesResponse,
    QuerySandboxContainersResponse,
    SandboxContainerSchema,
    SandboxContainerStatus,
)
from schema.system_user.users import SystemUserRole
from service.common.pagination import paginated_payload
from service.sandbox.files import (
    ContainerUploadSource,
    copy_container_files,
    create_container_directory,
    delete_container_files,
    download_container_paths,
    get_container_file_info,
    list_container_files,
    move_container_files,
    read_container_file,
    resolve_file_container,
    upload_container_files,
    write_container_file,
)
from service.sandbox.lifecycle import (
    create_sandbox_container,
    delete_sandbox_container,
    start_sandbox_container,
    stop_sandbox_container,
)
from service.sandbox.novnc import (
    proxy_novnc_http,
    proxy_novnc_websocket,
    resolve_novnc_target,
)
from service.sandbox.records import (
    query_available_sandbox_containers,
    query_sandbox_containers,
)
from service.sandbox.shell import (
    ContainerShellSession,
    open_container_shell,
    read_container_shell,
    resize_container_shell,
    resolve_shell_container,
    write_container_shell,
)
from service.sandbox.types import (
    SandboxContainerMutationResult,
    SandboxContainerRecord,
)


logger = get_logger(__name__)


def _sandbox_container_schema(record: SandboxContainerRecord) -> SandboxContainerSchema:
    container = record.container
    return SandboxContainerSchema(
        id=container.id or 0,
        container_name=container.container_name,
        container_hash=container.container_hash,
        image_id=container.image_id,
        image_name=record.image_name,
        container_command=container.container_command,
        port_mappings=container.port_mappings,
        novnc_support=container.novnc_support,
        novnc_port=container.novnc_port,
        status=container.status,
        owner_id=container.owner_id,
        owner_username=record.owner_username,
        created_at=container.created_at,
        updated_at=container.updated_at,
    )


def _mutation_response(result: SandboxContainerMutationResult) -> CommonResponse:
    if result.record is None:
        status = HTTPStatus.NOT_FOUND if result.not_found else HTTPStatus.BAD_REQUEST
        return CommonResponse(code=status.value, message=result.message)
    if not result.changed:
        return CommonResponse(
            code=HTTPStatus.BAD_REQUEST.value,
            message=result.message,
            data=_sandbox_container_schema(result.record),
        )
    return CommonResponse(
        message=result.message,
        data=_sandbox_container_schema(result.record),
    )


async def create_sandbox_container_handler(
    request: CreateSandboxContainerRequest,
    owner_id: int,
) -> CommonResponse:
    result = await create_sandbox_container(
        image_id=request.image_id,
        owner_id=owner_id,
        container_command=request.container_command,
        port_mappings=request.port_mappings,
        novnc_support=request.novnc_support,
        novnc_port=request.novnc_port,
    )
    return _mutation_response(result)


async def start_sandbox_container_handler(id: int) -> CommonResponse:
    return _mutation_response(await start_sandbox_container(id))


async def stop_sandbox_container_handler(id: int) -> CommonResponse:
    return _mutation_response(await stop_sandbox_container(id))


async def delete_sandbox_container_handler(id: int) -> CommonResponse:
    if not await delete_sandbox_container(id):
        return CommonResponse(code=HTTPStatus.NOT_FOUND.value, message="sandbox container not found")
    return CommonResponse(data=DeleteSandboxContainerResponse(id=id))


async def query_sandbox_containers_handler(page: int, size: int, keyword: str) -> CommonResponse:
    sandbox_containers = await query_sandbox_containers(page=page, size=size, keyword=keyword)
    return CommonResponse(data=QuerySandboxContainersResponse(
        **paginated_payload(
            sandbox_containers,
            [_sandbox_container_schema(record) for record in sandbox_containers.items],
        ),
    ))


async def query_available_sandbox_containers_handler(
    page: int,
    size: int,
    keyword: str,
    user_id: int,
    user_role: SystemUserRole,
) -> CommonResponse:
    sandbox_containers = await query_available_sandbox_containers(
        page=page,
        size=size,
        keyword=keyword,
        user_id=user_id,
        user_role=user_role,
    )
    return CommonResponse(data=QuerySandboxContainersResponse(
        **paginated_payload(
            sandbox_containers,
            [_sandbox_container_schema(record) for record in sandbox_containers.items],
        ),
    ))


async def handle_container_shell_stream(websocket: WebSocket, container_hash: str, token: str) -> None:
    user = _authenticate_ws_token(token)
    if user is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    if not await _can_access_container_by_hash(user, container_hash):
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    sandbox_container = await resolve_shell_container(container_hash)
    if sandbox_container is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    shell: ContainerShellSession | None = None
    reader: asyncio.Task | None = None
    receiver: asyncio.Task | None = None

    try:
        shell = await open_container_shell(container_hash)
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
                await write_container_shell(shell, message)
                continue

            if not isinstance(payload, dict):
                continue
            message_type = payload.get("type")
            if message_type == "input":
                await write_container_shell(shell, str(payload.get("data", "")))
            elif message_type == "resize":
                rows = _bounded_int(payload.get("rows"), default=24, minimum=1, maximum=300)
                cols = _bounded_int(payload.get("cols"), default=80, minimum=1, maximum=500)
                await resize_container_shell(shell, rows=rows, cols=cols)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("container shell stream failed: %s", container_hash)
        await _close_silently(websocket)
    finally:
        try:
            if shell is not None:
                shell.shutdown()
            await _cancel_task(receiver)
            await _finish_reader_task(reader)
        finally:
            if shell is not None:
                await asyncio.to_thread(shell.close)


async def _forward_shell_output(websocket: WebSocket, shell: ContainerShellSession) -> None:
    while True:
        data = await read_container_shell(shell)
        if not data:
            return
        if websocket.client_state != WebSocketState.CONNECTED or websocket.application_state != WebSocketState.CONNECTED:
            return
        await websocket.send_bytes(data)


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
        logger.debug("container shell reader stopped with error", exc_info=True)


def _authenticate_ws_token(token: str):
    try:
        return decode_access_token(token)
    except Exception:
        return None


async def _can_access_container_by_hash(user, container_hash: str) -> bool:
    """Admin can access any container; regular users can only access their own."""
    if user.role == SystemUserRole.ADMIN:
        return True
    async with get_async_session() as session:
        result = await session.exec(
            _select(SandboxContainer.owner_id).where(SandboxContainer.container_hash == container_hash)
        )
        owner_id = result.first()
        return owner_id == user.id if owner_id is not None else False


async def _can_access_container_by_id(user, container_id: int) -> bool:
    """Admin can access any container; regular users can only access their own."""
    if user.role == SystemUserRole.ADMIN:
        return True
    async with get_async_session() as session:
        container = await session.get(SandboxContainer, container_id)
        return container is not None and container.owner_id == user.id


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(number, maximum))


# ── container file manager handlers ───────────────────────────────────────────


def _file_container_common_response(data: Any = None, message: str = "success") -> CommonResponse:
    return CommonResponse(data=data, message=message)


def _file_container_error(code: int, message: str) -> CommonResponse:
    return CommonResponse(code=code, message=message)


def _file_container_json_error(code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=code,
        content=_file_container_error(code, message).model_dump(),
    )


async def _resolve_running_container(id: int, action: str, user=None) -> tuple[str, CommonResponse | None]:
    """Resolve container, check ownership, and verify it is running. Returns (hash, error_or_none)."""
    if user is not None and not await _can_access_container_by_id(user, id):
        return "", _file_container_error(HTTPStatus.FORBIDDEN.value, "no permission to access this sandbox container")
    resolved = await resolve_file_container(id)
    if resolved is None:
        return "", _file_container_error(HTTPStatus.NOT_FOUND.value, "sandbox container not found")
    container_hash, status = resolved
    if status != SandboxContainerStatus.RUNNING:
        return "", _file_container_error(HTTPStatus.BAD_REQUEST.value, f"only running sandbox containers can {action}")
    return container_hash, None


async def handle_list_files(id: int, path: str, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "browse files", user=user)
    if error:
        return error
    try:
        files = await list_container_files(container_hash, path)
    except Exception:
        logger.exception("failed to list container files: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to list container files")
    return _file_container_common_response(ListContainerFilesResponse(path=path, files=files))


async def handle_read_file(id: int, path: str, base64_mode: bool = False, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "read files", user=user)
    if error:
        return error
    try:
        info = await get_container_file_info(container_hash, path)
        if info is None:
            return _file_container_error(HTTPStatus.NOT_FOUND.value, "file not found")
        if info.type == ContainerFileType.DIRECTORY:
            return _file_container_error(HTTPStatus.BAD_REQUEST.value, "cannot read a directory")
    except Exception:
        logger.exception("failed to get container file info: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to get container file info")
    try:
        content = await read_container_file(container_hash, path, base64_mode=base64_mode)
    except Exception:
        logger.exception("failed to read container file: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to read container file")
    return _file_container_common_response(ContainerFileReadResponse(path=path, content=content, size=len(content.encode())))


async def handle_write_file(id: int, body: ContainerFileWriteRequest, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "write files", user=user)
    if error:
        return error
    try:
        ok = await write_container_file(container_hash, body.path, body.content)
    except Exception:
        logger.exception("failed to write container file: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to write container file")
    if not ok:
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to write container file")
    return _file_container_common_response(message="file written")


async def handle_upload_files(
    id: int,
    path: str,
    files: list[UploadFile],
    overwrite: bool,
    user=None,
) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "upload files", user=user)
    if error:
        return error
    if not files:
        return _file_container_error(HTTPStatus.BAD_REQUEST.value, "no files uploaded")

    try:
        sources = [ContainerUploadSource(filename=file.filename or "", stream=file.file) for file in files]
        uploaded = await upload_container_files(container_hash, path, sources, overwrite)
    except ValueError as exc:
        return _file_container_error(HTTPStatus.BAD_REQUEST.value, str(exc))
    except FileExistsError as exc:
        return _file_container_error(HTTPStatus.CONFLICT.value, str(exc))
    except FileNotFoundError as exc:
        return _file_container_error(HTTPStatus.NOT_FOUND.value, str(exc))
    except Exception:
        logger.exception("failed to upload container files: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to upload container files")

    return _file_container_common_response(
        data=ContainerFileUploadResponse(path=path, files=uploaded),
        message="files uploaded",
    )


async def handle_download_files(id: int, paths: list[str], user=None) -> StreamingResponse | JSONResponse:
    container_hash, error = await _resolve_running_container(id, "download files", user=user)
    if error:
        return JSONResponse(status_code=error.code, content=error.model_dump())
    if not paths:
        return _file_container_json_error(HTTPStatus.BAD_REQUEST.value, "download path is required")

    try:
        download = await download_container_paths(container_hash, paths)
    except ValueError as exc:
        return _file_container_json_error(HTTPStatus.BAD_REQUEST.value, str(exc))
    except FileNotFoundError as exc:
        return _file_container_json_error(HTTPStatus.NOT_FOUND.value, str(exc))
    except Exception:
        logger.exception("failed to download container files: %s", id)
        return _file_container_json_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to download container files")

    filename = download.filename.replace('"', "_")
    encoded_filename = quote(download.filename)
    return StreamingResponse(
        download.chunks,
        media_type=download.media_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded_filename}",
            "X-Content-Type-Options": "nosniff",
        },
    )


async def handle_copy_files(id: int, body: ContainerFileCopyRequest, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "copy files", user=user)
    if error:
        return error
    try:
        ok = await copy_container_files(container_hash, body.sources, body.destination)
    except Exception:
        logger.exception("failed to copy container files: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to copy container files")
    if not ok:
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to copy container files")
    return _file_container_common_response(message="files copied")


async def handle_move_files(id: int, body: ContainerFileMoveRequest, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "move files", user=user)
    if error:
        return error
    try:
        ok = await move_container_files(container_hash, body.sources, body.destination)
    except Exception:
        logger.exception("failed to move container files: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to move container files")
    if not ok:
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to move container files")
    return _file_container_common_response(message="files moved")


async def handle_delete_files(id: int, body: ContainerFileDeleteRequest, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "delete files", user=user)
    if error:
        return error
    try:
        ok = await delete_container_files(container_hash, body.paths)
    except Exception:
        logger.exception("failed to delete container files: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to delete container files")
    if not ok:
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to delete container files")
    return _file_container_common_response(message="files deleted")


async def handle_mkdir(id: int, body: ContainerFileMkdirRequest, user=None) -> CommonResponse:
    container_hash, error = await _resolve_running_container(id, "create directories", user=user)
    if error:
        return error
    try:
        ok = await create_container_directory(container_hash, body.path)
    except Exception:
        logger.exception("failed to create container directory: %s", id)
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to create container directory")
    if not ok:
        return _file_container_error(HTTPStatus.INTERNAL_SERVER_ERROR.value, "failed to create container directory")
    return _file_container_common_response(message="directory created")


# ── noVNC proxy handlers ───────────────────────────────────────────────────────


async def handle_novnc_http_proxy(container_hash: str, path: str, token: str) -> FastAPIResponse:
    if not _is_valid_novnc_http_request(container_hash, token):
        return FastAPIResponse(status_code=HTTPStatus.NOT_FOUND.value, content="Not Found")

    target = await resolve_novnc_target(container_hash)
    if target is None:
        return FastAPIResponse(status_code=HTTPStatus.NOT_FOUND.value, content="Not Found")

    response = await proxy_novnc_http(target, path)
    if response is None:
        return FastAPIResponse(status_code=HTTPStatus.BAD_GATEWAY.value, content="Bad Gateway")

    content_type = response.headers.get("content-type", "application/octet-stream")
    return FastAPIResponse(
        content=response.content,
        status_code=response.status_code,
        media_type=content_type.split(";")[0].strip(),
        headers=_filter_proxy_headers(response.headers),
    )


def _is_valid_novnc_http_request(container_hash: str, token: str) -> bool:
    if token and _authenticate_ws_token(token) is not None:
        return True
    return len(container_hash) >= 32 and container_hash.isalnum()


def _filter_proxy_headers(headers) -> dict[str, str]:
    skip = {"transfer-encoding", "connection", "content-encoding", "content-length"}
    return {
        key: value for key, value in headers.items()
        if key.lower() not in skip
    }


async def handle_novnc_ws_proxy(websocket: WebSocket, container_hash: str, token: str) -> None:
    user = _authenticate_ws_token(token)
    if user is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    if not await _can_access_container_by_hash(user, container_hash):
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    target = await resolve_novnc_target(container_hash)
    if target is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    requested_protocols = websocket.headers.get("sec-websocket-protocol", "").split(",")
    requested_protocols = [p.strip() for p in requested_protocols if p.strip()]
    accept_protocol = "binary" if "binary" in requested_protocols else None

    await websocket.accept(subprotocol=accept_protocol)

    async def receive_from_client():
        try:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return None
            if "bytes" in message and message["bytes"]:
                return message["bytes"]
            if "text" in message and message["text"]:
                return message["text"]
            return None
        except WebSocketDisconnect:
            return None
        except Exception:
            return None

    async def send_to_client(data):
        if websocket.client_state != WebSocketState.CONNECTED:
            return
        if isinstance(data, bytes):
            await websocket.send_bytes(data)
        else:
            await websocket.send_text(data)

    def client_connected():
        return (
            websocket.client_state == WebSocketState.CONNECTED
            and websocket.application_state == WebSocketState.CONNECTED
        )

    try:
        await proxy_novnc_websocket(
            target, receive_from_client, send_to_client, client_connected,
            subprotocols=requested_protocols or None,
        )
    except Exception:
        logger.debug("novnc ws proxy handler error: %s", container_hash, exc_info=True)
    finally:
        await _close_silently(websocket, ws_status.WS_1000_NORMAL_CLOSURE)
