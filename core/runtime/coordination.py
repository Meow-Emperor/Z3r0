from collections.abc import Awaitable, Callable

from schema.agent.events import AgentEventSchema


_EventPublisher = Callable[[str, AgentEventSchema], bool]
_MainAgentResumeHandler = Callable[[str], Awaitable[None]]
_TargetAgentResumeHandler = Callable[[str, str], Awaitable[None]]
_SubagentCancelHandler = Callable[[int], Awaitable[bool]]
_SessionSubagentCancelHandler = Callable[[str], Awaitable[bool]]

_event_publisher: _EventPublisher | None = None
_main_agent_resume_handler: _MainAgentResumeHandler | None = None
_target_agent_resume_handler: _TargetAgentResumeHandler | None = None
_sandbox_subagent_cancel_handler: _SubagentCancelHandler | None = None
_session_subagent_cancel_handler: _SessionSubagentCancelHandler | None = None


def set_agent_event_publisher(publisher: _EventPublisher) -> None:
    global _event_publisher
    _event_publisher = publisher


def publish_agent_event(session_id: str, event: AgentEventSchema) -> bool:
    return _event_publisher(session_id, event) if _event_publisher is not None else False


def set_main_agent_resume_handler(handler: _MainAgentResumeHandler) -> None:
    global _main_agent_resume_handler
    _main_agent_resume_handler = handler


async def resume_main_agent_session(session_id: str) -> None:
    if _main_agent_resume_handler is not None:
        await _main_agent_resume_handler(session_id)


def set_target_agent_resume_handler(handler: _TargetAgentResumeHandler) -> None:
    global _target_agent_resume_handler
    _target_agent_resume_handler = handler


async def resume_target_agent_instance(session_id: str, agent_instance_id: str) -> None:
    if _target_agent_resume_handler is not None:
        await _target_agent_resume_handler(session_id, agent_instance_id)


def set_subagent_cancel_handlers(
    sandbox_handler: _SubagentCancelHandler,
    session_handler: _SessionSubagentCancelHandler,
) -> None:
    global _sandbox_subagent_cancel_handler, _session_subagent_cancel_handler
    _sandbox_subagent_cancel_handler = sandbox_handler
    _session_subagent_cancel_handler = session_handler


async def cancel_sandbox_subagents(container_id: int) -> bool:
    if _sandbox_subagent_cancel_handler is None:
        return False
    return await _sandbox_subagent_cancel_handler(container_id)


async def cancel_session_subagents(session_id: str) -> bool:
    if _session_subagent_cancel_handler is None:
        return False
    return await _session_subagent_cancel_handler(session_id)
