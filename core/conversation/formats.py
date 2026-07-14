"""Canonical formats for application-generated conversation context."""

from __future__ import annotations

from typing import Any
from unicodedata import category


CONTEXT_SUMMARY_HEADER = "# Context Summary"
TASK_RESUMPTION_CONTEXT_HEADER = "# Task Resumption Context"
CONTEXT_SUMMARY_ITEM_ID = "context_summary"
TASK_RESUMPTION_CONTEXT_ITEM_ID = "task_resumption_context"
CONTEXT_SUMMARY_USER_GOALS_SECTION = "User Goals"
CONTEXT_SUMMARY_SECTIONS = (
    CONTEXT_SUMMARY_USER_GOALS_SECTION,
    "Active Constraints",
    "Decisions",
    "Relevant Files And Code",
    "Tool Results",
    "Open Tasks",
    "Current State",
)

_CONTEXT_SUMMARY_INTRO = (
    "This is context, not a new user request. Continue from the summary below."
)
_INTERNAL_CONTEXT_ITEM_IDS = frozenset({
    CONTEXT_SUMMARY_ITEM_ID,
    TASK_RESUMPTION_CONTEXT_ITEM_ID,
})
_INTERNAL_CONTEXT_ITEM_ID_PREFIXES = ("foreign_",)
_SUMMARY_SECTION_NAMES = {
    section.casefold(): section
    for section in CONTEXT_SUMMARY_SECTIONS
}


def format_context_summary(summary: str) -> str:
    body = _normalize_context_summary_body(summary)
    return f"{CONTEXT_SUMMARY_HEADER}\n\n{_CONTEXT_SUMMARY_INTRO}\n\n{body}"


def is_context_summary_text(text: str) -> bool:
    return _starts_with_header(text, CONTEXT_SUMMARY_HEADER)


def is_context_summary_item(item: Any) -> bool:
    return _is_user_message(item) and item.get("id") == CONTEXT_SUMMARY_ITEM_ID


def is_internal_context_item(item: Any) -> bool:
    return _is_user_message(item) and item.get("id") in _INTERNAL_CONTEXT_ITEM_IDS


def strip_internal_context_item_id(item: Any) -> Any:
    """Remove the application-only identity before provider submission."""
    if not _is_message(item) or not _is_internal_context_item_id(item.get("id")):
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
        _is_message(item)
        and item.get("role") == "user"
    )


def _is_message(item: Any) -> bool:
    return isinstance(item, dict) and item.get("type") == "message"


def _is_internal_context_item_id(value: Any) -> bool:
    return (
        isinstance(value, str)
        and (
            value in _INTERNAL_CONTEXT_ITEM_IDS
            or value.startswith(_INTERNAL_CONTEXT_ITEM_ID_PREFIXES)
        )
    )


def _normalize_context_summary_body(summary: str) -> str:
    text = sanitize_context_text(summary).strip()
    lines = _strip_outer_markdown_fence(text.splitlines())
    sections: dict[str, list[str]] = {
        section: []
        for section in CONTEXT_SUMMARY_SECTIONS
    }
    unsectioned: list[str] = []
    current_section: str | None = None
    found_section = False

    for line in lines:
        stripped = line.strip()
        if stripped.casefold() == CONTEXT_SUMMARY_HEADER.casefold():
            continue
        if stripped.startswith("## "):
            heading = stripped[3:].strip()
            section = _SUMMARY_SECTION_NAMES.get(heading.casefold())
            if section is not None:
                current_section = section
                found_section = True
            elif current_section is not None and heading:
                sections[current_section].append(heading)
            continue
        if current_section is None:
            unsectioned.append(line)
        else:
            sections[current_section].append(line)

    if not found_section:
        sections["Current State"] = unsectioned

    rendered: list[str] = []
    for section in CONTEXT_SUMMARY_SECTIONS:
        body = _normalize_context_block(sections[section]) or "None"
        rendered.append(f"## {section}\n\n{body}")
    return "\n\n".join(rendered)


def _strip_outer_markdown_fence(lines: list[str]) -> list[str]:
    if len(lines) >= 2 and lines[0].strip().startswith("```") and lines[-1].strip() == "```":
        return lines[1:-1]
    return lines


def _normalize_context_block(lines: list[str]) -> str:
    normalized: list[str] = []
    previous_blank = True
    for line in lines:
        line = line.rstrip()
        if line.strip():
            normalized.append(line)
            previous_blank = False
        elif not previous_blank:
            normalized.append("")
            previous_blank = True
    return "\n".join(normalized).strip()
