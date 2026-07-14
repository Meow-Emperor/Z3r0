"""Build bounded retrieval queries from user-authored conversation context."""

from __future__ import annotations

from typing import Any, Protocol

from core.conversation.formats import (
    CONTEXT_SUMMARY_USER_GOALS_SECTION,
    context_summary_section,
    is_context_summary_item,
    is_internal_context_item,
    sanitize_context_text,
)
from core.conversation.items import extract_message_text
from core.conversation.utterances import canonical_utterance_key, is_non_topic_utterance
from logger import get_logger


logger = get_logger(__name__)

_HISTORY_ITEM_LIMIT = 32
_RECENT_TOPIC_LIMIT = 3
_CURRENT_TEXT_MAX_CHARS = 4_000
_RECENT_TOPICS_MAX_CHARS = 2_000
_RECENT_TOPIC_MAX_CHARS = 800
_EMPTY_SUMMARY_KEYS = frozenset({"none", "无", "暂无", "没有"})


class RetrievalSession(Protocol):
    async def get_items_for_retrieval(self, recent_limit: int) -> list[Any]: ...


async def build_conversation_retrieval_query(
    session: RetrievalSession,
    current_text: str,
) -> str:
    """Combine the current request with bounded, user-authored session context."""
    current = _clip_text(_normalize_text(current_text), _CURRENT_TEXT_MAX_CHARS)
    if is_non_topic_utterance(current):
        current = ""
    try:
        items = await session.get_items_for_retrieval(_HISTORY_ITEM_LIMIT)
    except Exception:
        logger.exception("failed to load session context for retrieval")
        return _format_retrieval_query(current, "")

    recent_topics, retrieval_summary = _history_context(items, current)
    historical = recent_topics or retrieval_summary
    return _format_retrieval_query(current, historical)


def _history_context(items: list[Any], current: str) -> tuple[str, str]:
    current_key = canonical_utterance_key(current)
    seen = {current_key} if current_key else set()
    recent: list[str] = []
    recent_chars = 0
    retrieval_summary = ""

    for raw_item in reversed(items):
        if not isinstance(raw_item, dict) or raw_item.get("role") != "user":
            continue
        text = _normalize_text(extract_message_text(raw_item.get("content")))
        if not text:
            continue
        if is_context_summary_item(raw_item):
            if not retrieval_summary:
                retrieval_summary = _summary_retrieval_text(text)
            continue
        if is_internal_context_item(raw_item):
            continue

        if is_non_topic_utterance(text):
            continue
        separator_chars = 2 if recent else 0
        remaining = _RECENT_TOPICS_MAX_CHARS - recent_chars - separator_chars
        if remaining <= 0 or len(recent) >= _RECENT_TOPIC_LIMIT:
            continue
        topic = _clip_text(text, min(_RECENT_TOPIC_MAX_CHARS, remaining))
        if not topic:
            continue
        key = canonical_utterance_key(topic)
        if not key or key in seen:
            continue
        seen.add(key)
        recent.append(topic)
        recent_chars += separator_chars + len(topic)

    return "\n\n".join(reversed(recent)), retrieval_summary


def _summary_retrieval_text(summary: str) -> str:
    user_goals = _clip_text(
        _normalize_text(context_summary_section(summary, CONTEXT_SUMMARY_USER_GOALS_SECTION)),
        _RECENT_TOPICS_MAX_CHARS,
    )
    return "" if canonical_utterance_key(user_goals) in _EMPTY_SUMMARY_KEYS else user_goals


def _format_retrieval_query(current: str, historical: str) -> str:
    sections: list[str] = []
    if current:
        sections.append(f"Current user message:\n{current}")
    if historical:
        sections.append(f"Recent user topics:\n{historical}")
    return "\n\n".join(sections)


def _normalize_text(value: str) -> str:
    normalized = sanitize_context_text(value)
    lines: list[str] = []
    blank = False
    for line in normalized.splitlines():
        line = line.strip()
        if line:
            lines.append(line)
            blank = False
        elif lines and not blank:
            lines.append("")
            blank = True
    return "\n".join(lines).strip()


def _clip_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit].rstrip()
