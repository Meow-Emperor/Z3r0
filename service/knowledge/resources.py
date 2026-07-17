from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from unicodedata import category

from fastapi import UploadFile
from lightrag import QueryParam
from lightrag.base import DeletionResult, DocStatus
from lightrag.constants import FULL_DOCS_FORMAT_PENDING_PARSE, PARSED_DIR_NAME
from lightrag.types import KnowledgeGraph
from lightrag.utils import sanitize_and_normalize_extracted_text

from config import get_config
from core.lightrag.runtime import LIGHTRAG_INPUT_DIR, LIGHTRAG_WORKSPACE, lightrag_client
from logger import get_logger
from schema.knowledge.resources import (
    KnowledgeDocumentDetailSchema,
    KnowledgeDocumentSchema,
    KnowledgeDocumentStatus,
    KnowledgeDocumentStatusCounts,
    KnowledgeGraphEdgeSchema,
    KnowledgeGraphNodeSchema,
    KnowledgeGraphSchema,
    KnowledgeVectorDetailSchema,
    KnowledgeVectorSchema,
    QueryKnowledgeDocumentsResponse,
    QueryKnowledgeVectorsResponse,
    RejectedKnowledgeDocumentUpload,
    UploadKnowledgeDocumentsResponse,
)
from service.knowledge.constants import (
    MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE,
    MAX_KNOWLEDGE_DOCUMENT_BYTES,
    MAX_KNOWLEDGE_FILENAME_BYTES,
    SUPPORTED_KNOWLEDGE_DOCUMENT_SUFFIXES,
)


_SOURCE_CLEANUP_ATTEMPTS = 3
_SOURCE_CLEANUP_RETRY_SECONDS = 0.25
_VECTOR_DOCUMENT_SCAN_PAGE_SIZE = 200
_GRAPH_DIRECT_MATCH_LIMIT = 50
_GRAPH_DIRECT_MATCH_DEPTH = 1

logger = get_logger(__name__)


class KnowledgeDocumentError(ValueError):
    pass


async def query_knowledge_documents(
    *,
    page: int,
    size: int,
    status: KnowledgeDocumentStatus | None,
) -> QueryKnowledgeDocumentsResponse:
    async with lightrag_client() as rag:
        page_task = rag.doc_status.get_docs_paginated(
            status_filter=DocStatus(status.value) if status is not None else None,
            page=page,
            page_size=size,
        )
        counts_task = rag.doc_status.get_all_status_counts()
        (rows, total), counts = await asyncio.gather(page_task, counts_task)
    items = [_knowledge_document_schema(document_id, document) for document_id, document in rows]
    return QueryKnowledgeDocumentsResponse(
        page=page,
        size=size,
        total=total,
        items=items,
        status_counts=_knowledge_document_status_counts(counts),
    )


async def get_knowledge_document(document_id: str) -> KnowledgeDocumentDetailSchema | None:
    async with lightrag_client() as rag:
        status_row, full_document = await asyncio.gather(
            rag.doc_status.get_by_id(document_id),
            rag.full_docs.get_by_id(document_id),
        )
    if status_row is None:
        return None

    document = _knowledge_document_schema(document_id, status_row)
    full_document = full_document or {}
    metadata = status_row.get("metadata")
    chunk_options = full_document.get("chunk_options")
    return KnowledgeDocumentDetailSchema(
        **document.model_dump(),
        content=str(full_document.get("content") or ""),
        chunk_ids=[
            str(chunk_id)
            for chunk_id in status_row.get("chunks_list") or []
            if chunk_id
        ],
        metadata=metadata if isinstance(metadata, dict) else {},
        content_hash=_optional_text(
            status_row.get("content_hash") or full_document.get("content_hash")
        ),
        parse_format=_optional_text(full_document.get("parse_format")),
        parse_engine=_optional_text(full_document.get("parse_engine")),
        process_options=_optional_text(full_document.get("process_options")),
        chunk_options=chunk_options if isinstance(chunk_options, dict) else {},
    )


async def upload_knowledge_documents(
    uploads: list[UploadFile],
) -> UploadKnowledgeDocumentsResponse:
    if not uploads:
        raise KnowledgeDocumentError("at least one document is required")

    workspace_dir = LIGHTRAG_INPUT_DIR / LIGHTRAG_WORKSPACE
    workspace_dir.mkdir(parents=True, exist_ok=True)
    accepted_files: list[tuple[str, Path]] = []
    unowned_source_paths: set[Path] = set()
    rejected_files: list[RejectedKnowledgeDocumentUpload] = []
    queued_files: list[str] = []
    track_ids: list[str] = []

    try:
        async with lightrag_client() as rag:
            for upload in uploads:
                display_name = _display_upload_file_name(upload)
                try:
                    file_name = _validate_upload_file_name(upload)
                    if await rag.doc_status.get_doc_by_file_basename(file_name) is not None:
                        raise KnowledgeDocumentError("a document with this file name already exists")

                    content = await _read_upload_content(upload)
                    source_path = workspace_dir / file_name
                    try:
                        await asyncio.to_thread(_write_new_document, source_path, content)
                    except FileExistsError:
                        raise KnowledgeDocumentError("a document with this file name already exists") from None
                except KnowledgeDocumentError as exc:
                    rejected_files.append(
                        RejectedKnowledgeDocumentUpload(
                            file_name=display_name,
                            message=str(exc),
                        )
                    )
                    continue

                accepted_files.append((file_name, source_path))
                unowned_source_paths.add(source_path)

            if not accepted_files:
                return UploadKnowledgeDocumentsResponse(
                    track_ids=[],
                    queued_files=[],
                    rejected_files=rejected_files,
                )

            for offset in range(
                0,
                len(accepted_files),
                MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE,
            ):
                batch = accepted_files[
                    offset:offset + MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE
                ]
                batch_names = [file_name for file_name, _ in batch]
                try:
                    track_id = await rag.apipeline_enqueue_documents(
                        [""] * len(batch),
                        file_paths=batch_names,
                        docs_format=FULL_DOCS_FORMAT_PENDING_PARSE,
                    )
                except Exception:
                    remaining = accepted_files[offset:]
                    logger.exception(
                        "failed to enqueue LightRAG document batch: offset=%s, size=%s",
                        offset,
                        len(batch),
                    )
                    await _remove_source_documents(
                        source_path
                        for _, source_path in remaining
                    )
                    unowned_source_paths.difference_update(
                        source_path for _, source_path in remaining
                    )
                    rejected_files.extend(
                        RejectedKnowledgeDocumentUpload(
                            file_name=file_name,
                            message="the document could not be queued",
                        )
                        for file_name, _ in remaining
                    )
                    break

                if track_id is None:
                    await _remove_source_documents(
                        source_path
                        for _, source_path in batch
                    )
                    unowned_source_paths.difference_update(
                        source_path for _, source_path in batch
                    )
                    rejected_files.extend(
                        RejectedKnowledgeDocumentUpload(
                            file_name=file_name,
                            message="the document is already indexed or queued",
                        )
                        for file_name, _ in batch
                    )
                    continue

                track_ids.append(track_id)
                queued_files.extend(batch_names)
                unowned_source_paths.difference_update(
                    source_path for _, source_path in batch
                )
    except BaseException as exc:
        await _remove_source_documents(unowned_source_paths, original_error=exc)
        if isinstance(exc, Exception):
            logger.exception("LightRAG document upload failed")
        raise

    return UploadKnowledgeDocumentsResponse(
        track_ids=track_ids,
        queued_files=queued_files,
        rejected_files=rejected_files,
    )


def _display_upload_file_name(upload: UploadFile) -> str:
    return Path((upload.filename or "").replace("\\", "/")).name.strip() or "unnamed document"


def _validate_upload_file_name(upload: UploadFile) -> str:
    file_name = Path((upload.filename or "").replace("\\", "/")).name.strip()
    suffix = Path(file_name).suffix.lower()
    if (
        not file_name
        or any(category(character) in {"Cc", "Cf", "Cs"} for character in file_name)
        or len(file_name.encode("utf-8")) > MAX_KNOWLEDGE_FILENAME_BYTES
    ):
        raise KnowledgeDocumentError("document file name is invalid")
    if suffix not in SUPPORTED_KNOWLEDGE_DOCUMENT_SUFFIXES:
        raise KnowledgeDocumentError("only Markdown and PDF documents are supported")
    return file_name


async def _read_upload_content(upload: UploadFile) -> bytes:
    content = await upload.read(MAX_KNOWLEDGE_DOCUMENT_BYTES + 1)
    if not content:
        raise KnowledgeDocumentError("document is empty")
    if len(content) > MAX_KNOWLEDGE_DOCUMENT_BYTES:
        raise KnowledgeDocumentError("document exceeds the 25 MB size limit")
    return content


async def delete_knowledge_document(document_id: str) -> DeletionResult:
    async with lightrag_client() as rag:
        result = await rag.adelete_by_doc_id(document_id, delete_llm_cache=True)
    if result.status == "fail":
        logger.error(
            "LightRAG document deletion failed: document_id=%s, status_code=%s, message=%s",
            document_id,
            result.status_code,
            result.message,
        )
    if result.status == "success" and result.file_path:
        await remove_knowledge_source_documents((result.file_path,))
    return result


async def query_knowledge_vectors(
    *,
    page: int,
    size: int,
) -> QueryKnowledgeVectorsResponse:
    async with lightrag_client() as rag:
        page_ids, total = await _knowledge_vector_page_ids(rag, page=page, size=size)
        rows = await rag.text_chunks.get_by_ids(page_ids)

    dimension = get_config().lightrag.embedding_dim
    rows_by_id = {
        str(row["id"]): row
        for row in rows
        if row is not None and row.get("id") is not None
    }
    items = [
        _knowledge_vector_schema(rows_by_id[chunk_id], dimension)
        for chunk_id in page_ids
        if chunk_id in rows_by_id
    ]
    return QueryKnowledgeVectorsResponse(page=page, size=size, total=total, items=items)


async def _knowledge_vector_page_ids(rag, *, page: int, size: int) -> tuple[list[str], int]:
    target_start = (page - 1) * size
    target_end = target_start + size
    document_page = 1
    document_total = 1
    scanned_documents = 0
    scanned_chunks = 0
    selected_documents: list[tuple[str, int]] = []

    while scanned_documents < document_total:
        documents, document_total = await rag.doc_status.get_docs_paginated(
            status_filter=DocStatus.PROCESSED,
            page=document_page,
            page_size=_VECTOR_DOCUMENT_SCAN_PAGE_SIZE,
        )
        if not documents:
            break
        for document_id, document in documents:
            chunks_count = max(int(_document_field(document, "chunks_count", 0) or 0), 0)
            chunk_end = scanned_chunks + chunks_count
            if chunk_end > target_start and scanned_chunks < target_end:
                selected_documents.append((document_id, scanned_chunks))
            scanned_chunks = chunk_end
        scanned_documents += len(documents)
        document_page += 1

    if not selected_documents:
        return [], scanned_chunks

    statuses = await rag.doc_status.get_by_ids([
        document_id
        for document_id, _ in selected_documents
    ])
    page_ids: list[str] = []
    for (_, chunk_start), status in zip(selected_documents, statuses, strict=True):
        chunk_ids = [
            str(chunk_id)
            for chunk_id in _document_field(status, "chunks_list", []) or []
            if chunk_id
        ]
        local_start = max(target_start - chunk_start, 0)
        local_end = max(min(target_end - chunk_start, len(chunk_ids)), 0)
        page_ids.extend(chunk_ids[local_start:local_end])

    return page_ids, scanned_chunks


async def get_knowledge_vector(vector_id: str) -> KnowledgeVectorDetailSchema | None:
    async with lightrag_client() as rag:
        row = await rag.text_chunks.get_by_id(vector_id)
    if row is None:
        return None

    heading = row.get("heading")
    sidecar = row.get("sidecar")
    vector = _knowledge_vector_schema(row, get_config().lightrag.embedding_dim)
    return KnowledgeVectorDetailSchema(
        **vector.model_dump(),
        heading=heading if isinstance(heading, dict) else {},
        source_metadata=sidecar if isinstance(sidecar, dict) else {},
    )


def _knowledge_document_schema(document_id: str, document: Any) -> KnowledgeDocumentSchema:
    raw_status = _document_field(document, "status")
    status_value = raw_status.value if isinstance(raw_status, DocStatus) else str(raw_status)
    return KnowledgeDocumentSchema(
        id=document_id,
        file_name=Path(str(_document_field(document, "file_path", "unknown"))).name,
        status=KnowledgeDocumentStatus(status_value),
        content_summary=str(_document_field(document, "content_summary", "")),
        content_length=max(int(_document_field(document, "content_length", 0) or 0), 0),
        chunks_count=max(int(_document_field(document, "chunks_count", 0) or 0), 0),
        track_id=_optional_text(_document_field(document, "track_id")),
        error=_optional_text(_document_field(document, "error_msg")),
        created_at=_document_field(document, "created_at"),
        updated_at=_document_field(document, "updated_at"),
    )


def _knowledge_document_status_counts(counts: dict[Any, Any]) -> KnowledgeDocumentStatusCounts:
    normalized = {
        key.value if isinstance(key, DocStatus) else str(key): max(int(value or 0), 0)
        for key, value in counts.items()
    }
    return KnowledgeDocumentStatusCounts(
        total=normalized.get("all", sum(
            normalized.get(status.value, 0)
            for status in KnowledgeDocumentStatus
        )),
        **{
            status.value: normalized.get(status.value, 0)
            for status in KnowledgeDocumentStatus
        },
    )


def _knowledge_vector_schema(row: dict[str, Any], dimension: int) -> KnowledgeVectorSchema:
    return KnowledgeVectorSchema(
        id=str(row["id"]),
        document_id=str(row["full_doc_id"]),
        chunk_index=max(int(row.get("chunk_order_index") or 0), 0),
        tokens=max(int(row.get("tokens") or 0), 0),
        content=str(row.get("content") or ""),
        file_name=Path(str(row.get("file_path") or "unknown")).name,
        dimension=dimension,
        created_at=row.get("create_time") or row.get("created_at"),
        updated_at=row.get("update_time") or row.get("create_time") or row.get("created_at"),
    )


def _document_field(document: Any, field: str, default: Any = None) -> Any:
    if isinstance(document, dict):
        return document.get(field, default)
    return getattr(document, field, default)


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _write_new_document(path: Path, content: bytes) -> None:
    with path.open("xb") as file:
        file.write(content)


async def _remove_source_document(
    path: Path,
    original_error: BaseException | None = None,
) -> None:
    try:
        await asyncio.to_thread(path.unlink, missing_ok=True)
    except Exception as cleanup_error:
        logger.exception("failed to remove LightRAG source document: %s", path)
        if original_error is not None:
            original_error.add_note(
                f"source document cleanup also failed: {cleanup_error}"
            )


async def _remove_source_documents(
    paths: Iterable[Path],
    *,
    original_error: BaseException | None = None,
) -> None:
    source_paths = list(paths)
    for offset in range(0, len(source_paths), MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE):
        await asyncio.gather(*(
            _remove_source_document(path, original_error)
            for path in source_paths[
                offset:offset + MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE
            ]
        ))


async def remove_knowledge_source_documents(file_names: Iterable[str]) -> None:
    canonical_names = list(dict.fromkeys(
        canonical_name
        for file_name in file_names
        if (canonical_name := Path(file_name).name)
    ))
    for offset in range(0, len(canonical_names), MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE):
        await asyncio.gather(*(
            _remove_source_document_copies(file_name)
            for file_name in canonical_names[
                offset:offset + MAX_KNOWLEDGE_DOCUMENT_BATCH_SIZE
            ]
        ))


async def remove_stale_knowledge_source_documents(retained_file_names: Iterable[str]) -> None:
    retained_names = {
        Path(file_name).name
        for file_name in retained_file_names
        if Path(file_name).name
    }
    source_names = await asyncio.to_thread(_knowledge_source_document_names)
    await remove_knowledge_source_documents(source_names - retained_names)


def _knowledge_source_document_names() -> set[str]:
    workspace_dir = LIGHTRAG_INPUT_DIR / LIGHTRAG_WORKSPACE
    source_names: set[str] = set()
    for directory in (workspace_dir, workspace_dir / PARSED_DIR_NAME):
        if not directory.is_dir():
            continue
        source_names.update(
            path.name
            for path in directory.iterdir()
            if path.is_file()
        )
    return source_names


async def _remove_source_document_copies(file_name: str) -> None:
    canonical_name = Path(file_name).name
    if not canonical_name:
        return
    workspace_dir = LIGHTRAG_INPUT_DIR / LIGHTRAG_WORKSPACE
    paths = (
        workspace_dir / canonical_name,
        workspace_dir / PARSED_DIR_NAME / canonical_name,
    )
    for attempt in range(1, _SOURCE_CLEANUP_ATTEMPTS + 1):
        try:
            await asyncio.gather(*(
                asyncio.to_thread(path.unlink, missing_ok=True)
                for path in paths
            ))
            return
        except Exception:
            if attempt >= _SOURCE_CLEANUP_ATTEMPTS:
                logger.exception(
                    "failed to remove indexed LightRAG source document: %s",
                    canonical_name,
                )
                return
            await asyncio.sleep(_SOURCE_CLEANUP_RETRY_SECONDS * attempt)


async def get_knowledge_graph(
    *,
    query: str,
    max_depth: int,
    max_nodes: int,
) -> KnowledgeGraphSchema:
    try:
        async with lightrag_client() as rag:
            graph = await rag.get_knowledge_graph(
                query.strip() or "*",
                max_depth=max_depth,
                max_nodes=max_nodes,
            )
    except Exception:
        logger.exception("LightRAG knowledge graph query failed")
        raise
    return _normalize_knowledge_graph(graph)


async def search_knowledge_graph(*, query: str, max_nodes: int) -> KnowledgeGraphSchema:
    normalized_query = query.strip()
    if not normalized_query:
        raise KnowledgeDocumentError("a graph search query is required")

    try:
        async with lightrag_client() as rag:
            matched_labels = await _search_knowledge_graph_labels(
                rag.chunk_entity_relation_graph,
                normalized_query,
                limit=min(max_nodes, _GRAPH_DIRECT_MATCH_LIMIT),
            )
            try:
                result = await rag.aquery_data(
                    normalized_query,
                    QueryParam(
                        mode="hybrid",
                        top_k=max_nodes,
                        chunk_top_k=1,
                        enable_rerank=False,
                    ),
                )
            except Exception:
                if not matched_labels:
                    raise
                logger.warning(
                    "LightRAG semantic graph search failed; returning direct label matches",
                    exc_info=True,
                )
                result = {}

            direct_graph = await _knowledge_graph_for_matched_labels(
                rag,
                matched_labels,
                max_nodes=max_nodes,
            )
    except Exception:
        logger.exception("LightRAG knowledge graph search failed")
        raise
    semantic_graph = _knowledge_graph_from_retrieval(result, max_nodes=max_nodes)
    return _merge_knowledge_graphs(
        (direct_graph, semantic_graph),
        max_nodes=max_nodes,
    )


async def _search_knowledge_graph_labels(
    graph_storage: Any,
    query: str,
    *,
    limit: int,
) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for term in _knowledge_graph_search_terms(query):
        remaining = limit - len(labels)
        if remaining <= 0:
            break
        matches = await graph_storage.search_labels(term, limit=remaining)
        for label in matches:
            normalized_label = str(label).strip()
            if not normalized_label or normalized_label in seen:
                continue
            seen.add(normalized_label)
            labels.append(normalized_label)
    return labels


def _knowledge_graph_search_terms(query: str) -> tuple[str, ...]:
    original = query.strip()
    canonical = sanitize_and_normalize_extracted_text(
        original,
        remove_inner_quotes=True,
    )
    compact = "".join(canonical.split()) if _contains_cjk(canonical) else ""
    return tuple(
        dict.fromkeys(
            term
            for term in (original, canonical, compact)
            if term
        )
    )


def _contains_cjk(value: str) -> bool:
    return any("\u3400" <= character <= "\u9fff" for character in value)


async def _knowledge_graph_for_matched_labels(
    rag: Any,
    labels: list[str],
    *,
    max_nodes: int,
) -> KnowledgeGraphSchema:
    matched_ids = frozenset(labels)
    graph = KnowledgeGraphSchema(nodes=[], edges=[], is_truncated=False)
    for label in labels:
        remaining = max_nodes - len(graph.nodes)
        if remaining <= 0:
            return graph.model_copy(update={"is_truncated": True})
        neighborhood = await rag.get_knowledge_graph(
            label,
            max_depth=_GRAPH_DIRECT_MATCH_DEPTH,
            max_nodes=remaining,
        )
        graph = _merge_knowledge_graphs(
            (
                graph,
                _normalize_knowledge_graph(
                    neighborhood,
                    matched_node_ids=matched_ids,
                ),
            ),
            max_nodes=max_nodes,
        )
    return graph


def _knowledge_graph_from_retrieval(
    result: dict[str, Any],
    *,
    max_nodes: int,
) -> KnowledgeGraphSchema:
    data = result.get("data") if result.get("status") == "success" else None
    if not isinstance(data, dict):
        return KnowledgeGraphSchema(nodes=[], edges=[], is_truncated=False)

    raw_entities = data.get("entities")
    raw_relationships = data.get("relationships")
    entities = raw_entities if isinstance(raw_entities, list) else []
    relationships = raw_relationships if isinstance(raw_relationships, list) else []
    nodes: dict[str, KnowledgeGraphNodeSchema] = {}
    truncated = False

    def add_node(
        node_id: str,
        properties: dict[str, Any],
        *,
        matched: bool = False,
    ) -> bool:
        nonlocal truncated
        if not node_id:
            return False
        if node_id in nodes:
            nodes[node_id] = nodes[node_id].model_copy(update={
                "properties": {**nodes[node_id].properties, **properties},
                "matched": nodes[node_id].matched or matched,
            })
            return True
        if len(nodes) >= max_nodes:
            truncated = True
            return False
        nodes[node_id] = KnowledgeGraphNodeSchema(
            id=node_id,
            labels=[node_id],
            properties=properties,
            matched=matched,
        )
        return True

    for entity in entities:
        if not isinstance(entity, dict):
            continue
        entity_name = str(entity.get("entity_name") or "").strip()
        add_node(entity_name, entity, matched=True)

    edges: list[KnowledgeGraphEdgeSchema] = []
    seen_edges: set[str] = set()
    for relationship in relationships:
        if not isinstance(relationship, dict):
            continue
        source = str(relationship.get("src_id") or "").strip()
        target = str(relationship.get("tgt_id") or "").strip()
        if not source or not target:
            continue
        if not add_node(source, {}) or not add_node(target, {}):
            continue
        edge_id = _knowledge_relationship_id(
            source,
            target,
            str(relationship.get("reference_id") or ""),
            str(relationship.get("keywords") or ""),
            str(relationship.get("description") or ""),
        )
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append(KnowledgeGraphEdgeSchema(
            id=edge_id,
            type=str(relationship.get("keywords") or "related"),
            source=source,
            target=target,
            properties=relationship,
        ))

    return KnowledgeGraphSchema(
        nodes=list(nodes.values()),
        edges=edges,
        is_truncated=truncated,
    )


def _normalize_knowledge_graph(
    graph: KnowledgeGraph,
    *,
    matched_node_ids: frozenset[str] = frozenset(),
) -> KnowledgeGraphSchema:
    node_ids: dict[str, str] = {}
    nodes: list[KnowledgeGraphNodeSchema] = []
    seen_labels: set[str] = set()
    for node in graph.nodes:
        label = next((item.strip() for item in node.labels if item.strip()), node.id)
        node_ids[node.id] = label
        if label in seen_labels:
            continue
        seen_labels.add(label)
        nodes.append(
            KnowledgeGraphNodeSchema(
                id=label,
                labels=[label],
                properties=node.properties,
                matched=label in matched_node_ids,
            )
        )

    edges: list[KnowledgeGraphEdgeSchema] = []
    seen_edges: set[str] = set()
    for edge in graph.edges:
        source = node_ids.get(edge.source)
        target = node_ids.get(edge.target)
        if source is None or target is None:
            continue
        edge_id = _knowledge_relationship_id(source, target, edge.id)
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append(
            KnowledgeGraphEdgeSchema(
                id=edge_id,
                type=edge.type or "related",
                source=source,
                target=target,
                properties=edge.properties,
            )
        )
    return KnowledgeGraphSchema(
        nodes=nodes,
        edges=edges,
        is_truncated=graph.is_truncated,
    )


def _merge_knowledge_graphs(
    graphs: Iterable[KnowledgeGraphSchema],
    *,
    max_nodes: int,
) -> KnowledgeGraphSchema:
    nodes: dict[str, KnowledgeGraphNodeSchema] = {}
    edge_candidates: list[KnowledgeGraphEdgeSchema] = []
    truncated = False

    for graph in graphs:
        truncated = truncated or graph.is_truncated
        for node in graph.nodes:
            existing = nodes.get(node.id)
            if existing is not None:
                nodes[node.id] = existing.model_copy(update={
                    "labels": list(dict.fromkeys((*existing.labels, *node.labels))),
                    "properties": {**existing.properties, **node.properties},
                    "matched": existing.matched or node.matched,
                })
                continue
            if len(nodes) >= max_nodes:
                truncated = True
                continue
            nodes[node.id] = node
        edge_candidates.extend(graph.edges)

    edges: list[KnowledgeGraphEdgeSchema] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for edge in edge_candidates:
        if edge.source not in nodes or edge.target not in nodes:
            truncated = True
            continue
        edge_key = (edge.source, edge.target, edge.type)
        if edge_key in seen_edges:
            continue
        seen_edges.add(edge_key)
        edges.append(edge)

    return KnowledgeGraphSchema(
        nodes=list(nodes.values()),
        edges=edges,
        is_truncated=truncated,
    )


def _knowledge_relationship_id(source: str, target: str, *identity: str) -> str:
    digest = hashlib.sha256("\0".join((source, target, *identity)).encode("utf-8")).hexdigest()
    return f"knowledge-relation:{digest}"
