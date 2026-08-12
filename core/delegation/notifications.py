"""Task-resumption prompts for completed background work.

Converts system-generated ``AgentNotificationSnapshot`` instances into
natural-language prompts consumable by the agent.  User-message
notifications are handled separately by the executor and should never
reach ``notification_prompt``.
"""

from core.conversation.formats import TASK_RESUMPTION_CONTEXT_HEADER, sanitize_context_text
from schema.agent.events import MAX_AGENT_TEXT_INPUT_CHARS
from schema.agent.notifications import AgentNotificationKind, AgentNotificationSnapshot


# Sandbox error payloads are short, but cap the inline preview defensively
# so a long stderr never blows up the resumption prompt.
_SANDBOX_ERROR_PREVIEW_CHARS = 1000


def notification_prompt(notification: AgentNotificationSnapshot) -> str:
    """Return a resumption prompt for a *system* notification.

    Raises ``ValueError`` if called with a ``USER_MESSAGE`` notification,
    which must be routed through the executor's content-reconstruction
    path instead.
    """
    if notification.is_user_message:
        raise ValueError(
            f"notification_prompt must not be called for USER_MESSAGE "
            f"notifications (id={notification.id})"
        )
    if notification.kind == AgentNotificationKind.SANDBOX_ASYNC_JOB_FINISHED:
        return _fit_text_input(_sandbox_async_job_prompt(notification))
    return _fit_text_input(_subagent_finished_prompt(notification))


_RESUMPTION_HEADER = (
    f"{TASK_RESUMPTION_CONTEXT_HEADER}\n\n"
    "Runtime event, not a new user request. Continue the existing task without describing delivery."
)


def _subagent_finished_prompt(notification: AgentNotificationSnapshot) -> str:
    # The notification carries metadata only; the result body remains in durable
    # storage so the resumption prompt stays small.
    payload = notification.payload
    status = str(payload.get("status") or "unknown")
    agent_code = str(payload.get("agent_code") or "")
    agent_name = str(payload.get("agent_name") or agent_code or "subagent")
    run_id = str(payload.get("run_id") or notification.run_id)
    work_item_id = payload.get("work_item_id")

    event_lines = [
        "- Event: delegated task completed",
        f"- Task: {run_id}",
        f"- Agent code: {agent_code or 'unknown'}",
        f"- Agent: {agent_name}",
        f"- Status: {status}",
    ]
    if isinstance(work_item_id, int) and work_item_id > 0:
        event_lines.append(f"- Bound WorkItem: {work_item_id}")

    sections = [
        _RESUMPTION_HEADER,
        "## Event\n\n" + "\n".join(event_lines),
        "## Next Step\n\n"
        "Read the complete delegated result before continuing. Report only a useful "
        "conclusion, coordination update, or next action.",
    ]
    return "\n\n".join(sections)


def _sandbox_async_job_prompt(notification: AgentNotificationSnapshot) -> str:
    payload = notification.payload
    status = str(payload.get("status") or "unknown")
    run_id = notification.run_id
    output_file = str(payload.get("output_file") or "")
    output_lines = int(payload.get("output_lines") or 0)
    output_bytes = int(payload.get("output_bytes") or 0)
    exit_code = payload.get("exit_code")
    work_item_id = payload.get("work_item_id")
    # Sandbox errors are short free-form strings without a paginated reader,
    # so inlining a capped preview is the only way to expose them here.
    error_preview = _truncate_inline(payload.get("error"), _SANDBOX_ERROR_PREVIEW_CHARS)

    event_lines = [
        "- Event: background command completed",
        f"- Job: {run_id}",
        f"- Status: {status}",
    ]
    if isinstance(work_item_id, int) and work_item_id > 0:
        event_lines.append(f"- Bound WorkItem: {work_item_id}")
    if exit_code is not None:
        event_lines.append(f"- Exit code: {exit_code}")
    if output_file:
        event_lines.append(f"- Output reference: {output_file}")
        event_lines.append(f"- Output lines: {output_lines}")
        event_lines.append(f"- Output bytes: {output_bytes}")
    sections = [
        _RESUMPTION_HEADER,
        "## Event\n\n" + "\n".join(event_lines),
    ]
    if error_preview:
        sections.append(f"## Error Preview\n\n{error_preview}")

    sections.append(
        "## Next Step\n\n"
        "The command is terminal. Read any relevant captured output, then continue or report "
        "the result.",
    )
    return "\n\n".join(sections)


def _truncate_inline(value: object, limit: int) -> str:
    text = sanitize_context_text(str(value or "")).strip()
    if not text:
        return ""
    return _truncate_with_marker(text, limit, "[Preview truncated.]")


def _fit_text_input(text: str) -> str:
    return _truncate_with_marker(
        text.strip() or "Task context is available.",
        MAX_AGENT_TEXT_INPUT_CHARS,
        "[Task resumption context truncated to fit input limits.]",
    )


def _truncate_with_marker(text: str, limit: int, marker: str) -> str:
    if len(text) <= limit:
        return text
    suffix = "\n\n" + marker
    body_limit = max(1, limit - len(suffix))
    return text[:body_limit].rstrip() + suffix
