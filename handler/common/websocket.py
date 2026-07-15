import asyncio
from typing import Any

from fastapi import WebSocket, status as ws_status

from logger import get_logger
from middleware.system_user import AuthUser, authenticate_access_token


logger = get_logger(__name__)


async def cancel_ws_task(task: asyncio.Task | None) -> None:
    """Cancel a WebSocket task and drain its result."""
    if task is None:
        return
    if task.done():
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def close_ws_silently(websocket: WebSocket, code: int = ws_status.WS_1011_INTERNAL_ERROR) -> None:
    try:
        await websocket.close(code=code)
    except Exception:
        pass


async def finish_ws_reader_task(task: asyncio.Task | None) -> None:
    """Wait briefly for a reader task, then cancel it if necessary."""
    if task is None:
        return
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=1)
    except asyncio.TimeoutError:
        await cancel_ws_task(task)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("WebSocket reader stopped with error", exc_info=True)


async def authenticate_ws_token(token: str) -> AuthUser | None:
    return await authenticate_access_token(token)


def bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(number, maximum))
