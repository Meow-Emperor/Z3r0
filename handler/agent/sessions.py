import asyncio
from http import HTTPStatus

from fastapi.websockets import WebSocketState
from fastapi import WebSocket, WebSocketDisconnect, status as ws_status
from fastapi.responses import FileResponse

from core.runtime.session import get_agent_pool
from handler.common.http import raise_api_error
from handler.common.websocket import (
    authenticate_ws_token,
    cancel_ws_task as _cancel_task,
    close_ws_silently as _close_silently,
)
from logger import get_logger
from middleware.auth import AuthUser, resolve_current_user
from schema.agent.events import AgentEventSchema
from schema.agent.sessions import (
    AgentSessionSummarySchema,
    AgentTurnRequest,
    AgentTurnResponse,
    ListAgentEventsResponse,
    ListAgentSessionsResponse,
    UpdateAgentSessionSandboxContainerRequest,
    UpdateAgentSessionTitleRequest,
)
from schema.common.responses import CommonResponse
from service.agent import runtime as agent_runtime
from service.agent import reports as agent_reports
from service.agent import sessions as agent_sessions
from service.common.pagination import paginated_payload


logger = get_logger(__name__)


async def create_agent_session_turn_handler(
    request: AgentTurnRequest,
    user: AuthUser,
) -> CommonResponse[AgentTurnResponse]:
    try:
        session_id, events = await agent_runtime.submit_new_chat_turn(
            content=request.content,
            user=user,
            sandbox_container_id=request.sandbox_container_id,
            requested_agent_code=request.agent_code,
        )
    except Exception as exc:
        _raise_runtime_error(exc)
        raise
    return await _turn_response(session_id, user, events)


async def submit_agent_session_turn_handler(
    session_id: str,
    request: AgentTurnRequest,
    user: AuthUser,
) -> CommonResponse[AgentTurnResponse]:
    try:
        events = await agent_runtime.submit_user_turn(
            session_id=session_id,
            content=request.content,
            user=user,
            sandbox_container_id=request.sandbox_container_id,
            requested_agent_code=request.agent_code,
        )
    except Exception as exc:
        _raise_runtime_error(exc)
        raise
    return await _turn_response(session_id, user, events)


async def interrupt_agent_session_handler(session_id: str, user: AuthUser) -> CommonResponse[AgentTurnResponse]:
    try:
        events = await agent_runtime.interrupt_turn(session_id=session_id, user=user)
    except Exception as exc:
        _raise_runtime_error(exc)
        raise
    return await _turn_response(session_id, user, events)


async def cancel_agent_session_tasks_handler(session_id: str, user: AuthUser) -> CommonResponse[AgentTurnResponse]:
    try:
        events = await agent_runtime.cancel_all_tasks(session_id=session_id, user=user)
    except Exception as exc:
        _raise_runtime_error(exc)
        raise
    return await _turn_response(session_id, user, events)


async def delete_agent_session_handler(session_id: str, user: AuthUser) -> CommonResponse[None]:
    deleted = await agent_sessions.delete_session(
        session_id,
        user_id=user.id,
        user_role=user.role,
    )
    if not deleted:
        raise_api_error(HTTPStatus.NOT_FOUND, "agent session not found")
    return CommonResponse(message="agent session deleted")


async def update_agent_session_title_handler(
    session_id: str,
    request: UpdateAgentSessionTitleRequest,
    user: AuthUser,
) -> CommonResponse[AgentSessionSummarySchema]:
    session = await agent_sessions.update_session_title(
        session_id=session_id,
        title=request.title,
        user_id=user.id,
        user_role=user.role,
    )
    if session is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "agent session not found")
    return CommonResponse(message="agent session title updated", data=session)


async def update_agent_session_sandbox_container_handler(
    session_id: str,
    request: UpdateAgentSessionSandboxContainerRequest,
    user: AuthUser,
) -> CommonResponse[AgentSessionSummarySchema]:
    try:
        session = await agent_runtime.update_selected_sandbox_container(
            session_id=session_id,
            sandbox_container_id=request.sandbox_container_id,
            user=user,
        )
    except Exception as exc:
        _raise_runtime_error(exc)
        raise
    return CommonResponse(message="sandbox container updated", data=session)


async def list_agent_sessions_handler(
    page: int,
    size: int,
    user: AuthUser,
) -> CommonResponse[ListAgentSessionsResponse]:
    sessions = await agent_sessions.list_sessions(
        page=page,
        size=size,
        user_id=user.id,
        user_role=user.role,
    )
    return CommonResponse(data=ListAgentSessionsResponse(
        **paginated_payload(sessions, sessions.items)
    ))


async def list_agent_events_handler(
    session_id: str,
    user: AuthUser,
    before_seq: int | None = None,
    limit: int = agent_sessions.DEFAULT_REPLAY_EVENT_PAGE_SIZE,
) -> CommonResponse[ListAgentEventsResponse]:
    result = await agent_sessions.replay_session_events_page(
        session_id=session_id,
        user_id=user.id,
        user_role=user.role,
        before_seq=before_seq,
        limit=limit,
    )
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "agent session not found")
    events, has_more, next_before_seq = result
    return CommonResponse(data=ListAgentEventsResponse(
        session_id=session_id,
        items=events,
        has_more=has_more,
        next_before_seq=next_before_seq,
    ))


async def download_agent_report_handler(report_id: str, user: AuthUser) -> FileResponse:
    try:
        report_path = agent_reports.resolve_report_download_path(report_id)
    except ValueError as exc:
        raise_api_error(HTTPStatus.BAD_REQUEST, str(exc))
    except FileNotFoundError as exc:
        raise_api_error(HTTPStatus.NOT_FOUND, str(exc))

    session_id = agent_reports.report_session_id(report_path)
    if not session_id or not await agent_sessions.can_access_session(session_id, user.id, user.role):
        raise_api_error(HTTPStatus.NOT_FOUND, "report file not found")

    return FileResponse(
        report_path,
        media_type="text/markdown; charset=utf-8",
        filename=agent_reports.report_download_filename(report_path),
    )


async def handle_agent_stream(websocket: WebSocket, session_id: str, token: str) -> None:
    user = await authenticate_ws_token(token)
    if user is None:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return
    if not await agent_sessions.can_access_session(session_id, user.id, user.role):
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    session = None
    event_queue: asyncio.Queue[AgentEventSchema | None] | None = None
    reader: asyncio.Task | None = None
    forwarder: asyncio.Task | None = None

    try:
        session, event_queue = await get_agent_pool().subscribe(session_id)
        reader = asyncio.create_task(_consume_websocket(websocket), name=f"agent-stream-reader-{session_id}")
        forwarder = asyncio.create_task(_forward_events(
            websocket, event_queue, session_id, user,
        ), name=f"agent-stream-forwarder-{session_id}")
        done, _ = await asyncio.wait(
            {reader, forwarder},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in done:
            task.result()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("agent stream failed for session=%s", session_id)
        await _close_silently(websocket)
    finally:
        if session is not None and event_queue is not None:
            session.unsubscribe(event_queue)
        await _cancel_task(reader)
        await _cancel_task(forwarder)


async def _consume_websocket(websocket: WebSocket) -> None:
    while True:
        try:
            message = await websocket.receive()
        except RuntimeError as exc:
            if "disconnect message has been received" not in str(exc):
                raise
            return
        if message.get("type") == "websocket.disconnect":
            return


async def _send_event(
    websocket: WebSocket,
    event: AgentEventSchema,
) -> bool:
    if (
        websocket.client_state != WebSocketState.CONNECTED
        or websocket.application_state != WebSocketState.CONNECTED
    ):
        return False
    try:
        await websocket.send_text(event.model_dump_json())
        return True
    except Exception:
        logger.debug("failed to send agent event to websocket", exc_info=True)
        return False


_ACCESS_CHECK_INTERVAL_SECONDS = 30

async def _forward_events(
    websocket: WebSocket,
    queue: asyncio.Queue[AgentEventSchema | None],
    session_id: str,
    user: AuthUser,
) -> None:
    try:
        loop = asyncio.get_running_loop()
        next_access_check = loop.time() + _ACCESS_CHECK_INTERVAL_SECONDS
        while True:
            timeout = max(0.0, next_access_check - loop.time())
            try:
                event = await asyncio.wait_for(queue.get(), timeout=timeout)
            except asyncio.TimeoutError:
                event = None
                timed_out = True
            else:
                timed_out = False

            if timed_out or loop.time() >= next_access_check:
                next_access_check = loop.time() + _ACCESS_CHECK_INTERVAL_SECONDS
                current_user = await resolve_current_user(user)
                if current_user is None or not await agent_sessions.can_access_session(
                    session_id,
                    current_user.id,
                    current_user.role,
                ):
                    await _close_silently(websocket, code=ws_status.WS_1008_POLICY_VIOLATION)
                    return
            if timed_out:
                continue
            if event is None:
                await _close_silently(websocket, code=ws_status.WS_1000_NORMAL_CLOSURE)
                return
            if not await _send_event(websocket, event):
                return
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("agent event forwarding stopped", exc_info=True)


async def _turn_response(
    session_id: str,
    user: AuthUser,
    events: list[AgentEventSchema],
) -> CommonResponse[AgentTurnResponse]:
    summary = await agent_sessions.session_summary(
        session_id,
        user_id=user.id,
        user_role=user.role,
    )
    if summary is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "agent session not found")
    return CommonResponse(data=AgentTurnResponse(session_id=session_id, session=summary, events=events))


def _raise_runtime_error(exc: Exception) -> None:
    if isinstance(exc, agent_runtime.SessionNotRunnableError):
        raise_api_error(HTTPStatus.BAD_REQUEST, "work project is canceled")
    if isinstance(exc, agent_runtime.SandboxContainerUnavailableError):
        raise_api_error(HTTPStatus.BAD_REQUEST, str(exc))
    if isinstance(exc, agent_runtime.AgentUnavailableError):
        raise_api_error(HTTPStatus.BAD_REQUEST, str(exc))
    if isinstance(exc, agent_runtime.SessionBusyError):
        raise_api_error(HTTPStatus.CONFLICT, str(exc))
    if isinstance(exc, PermissionError):
        raise_api_error(HTTPStatus.NOT_FOUND, "agent session not found")
