from typing import Any


TEXT_CONTENT_TYPES = frozenset({"input_text", "output_text", "text"})


def extract_message_text(content: Any) -> str:
    """Extract text from a message content string or typed content list."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for piece in content:
        if not isinstance(piece, dict) or piece.get("type") not in TEXT_CONTENT_TYPES:
            continue
        text = piece.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts)


def tool_call_id(item: dict[str, Any]) -> str:
    value = item.get("call_id") or item.get("id")
    return value if isinstance(value, str) else ""
