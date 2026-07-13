"""Canonical formats for application-generated conversation context."""

from __future__ import annotations

from typing import Any
from unicodedata import category


CONTEXT_SUMMARY_HEADER = "# Context Summary"
TASK_RESUMPTION_CONTEXT_HEADER = "# Task Resumption Context"
CONTEXT_SUMMARY_ITEM_ID = "context_summary"
TASK_RESUMPTION_CONTEXT_ITEM_ID = "task_resumption_context"

_CONTEXT_SUMMARY_INTRO = (
    "This is context, not a new user request. Continue from the summary below."
)
_INTERNAL_CONTEXT_ITEM_IDS = frozenset({
    CONTEXT_SUMMARY_ITEM_ID,
    TASK_RESUMPTION_CONTEXT_ITEM_ID,
})


def format_context_summary(summary: str) -> str:
    body = sanitize_context_text(summary).strip()
    return f"{CONTEXT_SUMMARY_HEADER}\n\n{_CONTEXT_SUMMARY_INTRO}\n\n{body}"


def is_context_summary_text(text: str) -> bool:
    return _starts_with_header(text, CONTEXT_SUMMARY_HEADER)


def is_context_summary_item(item: Any) -> bool:
    return _is_user_message(item) and item.get("id") == CONTEXT_SUMMARY_ITEM_ID


def is_internal_context_item(item: Any) -> bool:
    return _is_user_message(item) and item.get("id") in _INTERNAL_CONTEXT_ITEM_IDS


def strip_internal_context_item_id(item: Any) -> Any:
    """Remove the application-only identity before provider submission."""
    if not is_internal_context_item(item):
        return item
    provider_item = dict(item)
    provider_item.pop("id", None)
    return provider_item


def sanitize_context_text(text: str) -> str:
    """Normalize newlines and remove non-text control characters."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return "".join(
        character
        for character in normalized
        if character in "\n\t" or category(character) not in {"Cc", "Cf", "Cs"}
    )


def context_summary_section(text: str, section: str) -> str:
    """Return one second-level Markdown section from a canonical context summary."""
    if not is_context_summary_text(text):
        return ""
    target = f"## {section}".casefold()
    lines = sanitize_context_text(text).splitlines()
    start: int | None = None
    for index, line in enumerate(lines):
        normalized = line.strip().casefold()
        if start is None:
            if normalized == target:
                start = index + 1
            continue
        if normalized.startswith("## "):
            return "\n".join(lines[start:index]).strip()
    return "\n".join(lines[start:]).strip() if start is not None else ""


def _starts_with_header(text: str, header: str) -> bool:
    stripped = text.lstrip()
    return stripped == header or stripped.startswith(f"{header}\n")


def _is_user_message(item: Any) -> bool:
    return (
        isinstance(item, dict)
        and item.get("type") == "message"
        and item.get("role") == "user"
    )
