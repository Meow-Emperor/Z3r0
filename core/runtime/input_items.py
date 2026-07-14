"""Helpers for constructing SDK input items consistently."""

from typing import Protocol

from agents import TResponseInputItem
from openai.types.responses import (
    ResponseInputImageParam,
    ResponseInputMessageContentListParam,
    ResponseInputTextParam,
)

from core.conversation.formats import TASK_RESUMPTION_CONTEXT_ITEM_ID
from schema.agent.events import AgentImageInputPart, AgentInputPart, AgentTextInputPart


class TurnTriggerProtocol(Protocol):
    content: list[AgentInputPart]

    @property
    def content_is_retrieval_input(self) -> bool:
        ...


def text_input_content(text: str) -> list[AgentInputPart]:
    return [AgentTextInputPart(text=text)]


def display_text_from_content(content: list[AgentInputPart]) -> str:
    text = retrieval_text_from_content(content)
    if text:
        return text
    image_count = sum(1 for part in content if isinstance(part, AgentImageInputPart))
    return "[Image]" if image_count == 1 else f"[{image_count} images]"


def retrieval_text_from_content(content: list[AgentInputPart]) -> str:
    """Return only user-provided text suitable for semantic retrieval."""
    return "\n\n".join(
        part.text.strip()
        for part in content
        if isinstance(part, AgentTextInputPart) and part.text.strip()
    )


def build_turn_input_item(trigger: TurnTriggerProtocol) -> TResponseInputItem:
    message_id = "" if trigger.content_is_retrieval_input else TASK_RESUMPTION_CONTEXT_ITEM_ID
    return build_user_message_item(trigger.content, message_id=message_id)


def build_user_message_item(
    content_parts: list[AgentInputPart],
    *,
    message_id: str = "",
) -> TResponseInputItem:
    content: ResponseInputMessageContentListParam = []
    for part in content_parts:
        if isinstance(part, AgentTextInputPart):
            text_item: ResponseInputTextParam = {"type": "input_text", "text": part.text}
            content.append(text_item)
        elif isinstance(part, AgentImageInputPart):
            image_item: ResponseInputImageParam = {
                "type": "input_image",
                "image_url": f"data:{part.media_type!s};base64,{part.data}",
                "detail": str(part.detail),
            }
            content.append(image_item)
    message: TResponseInputItem = {"type": "message", "role": "user", "content": content}
    if message_id:
        message["id"] = message_id
    return message
