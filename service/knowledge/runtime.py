from __future__ import annotations

import asyncio
from collections.abc import Iterable

from lightrag.base import DocStatus

from core.lightrag.runtime import lightrag_client
from logger import get_logger
from service.knowledge.resources import (
    remove_knowledge_source_documents,
    remove_stale_knowledge_source_documents,
)


logger = get_logger(__name__)

_DOCUMENT_STATUS_POLL_SECONDS = 5
_PIPELINE_RETRY_SECONDS = 5
_RECOVERABLE_STATUSES = (
    DocStatus.PENDING,
    DocStatus.PARSING,
    DocStatus.ANALYZING,
    DocStatus.PROCESSING,
    DocStatus.FAILED,
)
_TERMINAL_STATUSES = frozenset({DocStatus.PROCESSED, DocStatus.FAILED})

_processing_task: asyncio.Task[None] | None = None
_processing_requested = asyncio.Event()
_pending_track_ids: set[str] = set()
_recover_on_next_run = False


async def start_knowledge_document_runtime() -> None:
    global _processing_task, _recover_on_next_run
    if _processing_task is not None and not _processing_task.done():
        return

    _recover_on_next_run = True
    _processing_task = asyncio.create_task(
        _knowledge_document_processing_loop(),
        name="knowledge-document-processing",
    )
    _processing_requested.set()
    logger.info("knowledge document runtime started")


async def stop_knowledge_document_runtime() -> None:
    global _processing_task
    task, _processing_task = _processing_task, None
    if task is None or task.done():
        return

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("knowledge document runtime stopped")


def request_knowledge_document_processing(track_ids: Iterable[str]) -> None:
    normalized_track_ids = {
        track_id.strip()
        for track_id in track_ids
        if isinstance(track_id, str) and track_id.strip()
    }
    if not normalized_track_ids:
        return
    _pending_track_ids.update(normalized_track_ids)
    _processing_requested.set()


async def _knowledge_document_processing_loop() -> None:
    global _recover_on_next_run
    while True:
        await _processing_requested.wait()
        _processing_requested.clear()

        track_ids = set(_pending_track_ids)
        _pending_track_ids.difference_update(track_ids)
        should_recover = _recover_on_next_run

        try:
            has_documents = bool(track_ids)
            if should_recover:
                recovered_documents, recovered_track_ids = await _recoverable_documents()
                has_documents = has_documents or recovered_documents
                track_ids.update(recovered_track_ids)
                _recover_on_next_run = False

            if not has_documents:
                continue
            await _process_knowledge_documents(track_ids)
        except asyncio.CancelledError:
            _pending_track_ids.update(track_ids)
            if should_recover:
                _recover_on_next_run = True
            raise
        except Exception:
            logger.exception("knowledge document pipeline iteration failed")
            if should_recover:
                _recover_on_next_run = True
            _pending_track_ids.update(track_ids)
            await asyncio.sleep(_PIPELINE_RETRY_SECONDS)
            _processing_requested.set()


async def _recoverable_documents() -> tuple[bool, set[str]]:
    async with lightrag_client() as rag:
        status_groups = await asyncio.gather(*(
            rag.get_docs_by_status(status)
            for status in _RECOVERABLE_STATUSES
        ))
    documents = {
        document_id: document
        for group in status_groups
        for document_id, document in group.items()
    }
    await remove_stale_knowledge_source_documents(
        document.file_path
        for document in documents.values()
    )

    track_ids = {
        document.track_id
        for document in documents.values()
        if document.track_id
    }
    if documents:
        logger.info("recovering LightRAG document queue: documents=%s", len(documents))
    return bool(documents), track_ids


async def _process_knowledge_documents(track_ids: set[str]) -> None:
    async with lightrag_client() as rag:
        await rag.apipeline_process_enqueue_documents()

    if track_ids:
        await _wait_for_document_tracks(track_ids)


async def _wait_for_document_tracks(track_ids: set[str]) -> None:
    remaining = set(track_ids)
    cleaned_document_ids: set[str] = set()
    reported_failed_document_ids: set[str] = set()

    while remaining:
        async with lightrag_client() as rag:
            current_track_ids = tuple(remaining)
            track_groups = await asyncio.gather(*(
                rag.aget_docs_by_track_id(track_id)
                for track_id in current_track_ids
            ))
        tracked_documents = dict(zip(current_track_ids, track_groups, strict=True))

        removable_file_names: list[str] = []
        for track_id, documents in tracked_documents.items():
            if not documents:
                remaining.discard(track_id)
                continue

            for document_id, document in documents.items():
                if document_id not in cleaned_document_ids and _source_is_disposable(document):
                    cleaned_document_ids.add(document_id)
                    removable_file_names.append(document.file_path)
                if (
                    document.status == DocStatus.FAILED
                    and document_id not in reported_failed_document_ids
                ):
                    reported_failed_document_ids.add(document_id)
                    logger.error(
                        "knowledge document processing failed: document_id=%s, file=%s, error=%s",
                        document_id,
                        document.file_path,
                        document.error_msg or "unspecified processing error",
                    )

            if all(
                document.status in _TERMINAL_STATUSES
                for document in documents.values()
            ):
                remaining.discard(track_id)

        await remove_knowledge_source_documents(removable_file_names)
        if remaining:
            await asyncio.sleep(_DOCUMENT_STATUS_POLL_SECONDS)


def _source_is_disposable(document: object) -> bool:
    status = getattr(document, "status", None)
    if status == DocStatus.PROCESSED:
        return True
    metadata = getattr(document, "metadata", None)
    return (
        status == DocStatus.FAILED
        and isinstance(metadata, dict)
        and metadata.get("is_duplicate") is True
    )
