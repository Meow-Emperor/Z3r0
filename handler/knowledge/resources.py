from http import HTTPStatus

from fastapi import UploadFile
from handler.common.http import raise_api_error
from schema.common.responses import CommonResponse
from schema.knowledge.resources import (
    DeleteKnowledgeDocumentResponse,
    KnowledgeDocumentStatus,
)
from service.knowledge.runtime import request_knowledge_document_processing
from service.knowledge.resources import (
    KnowledgeDocumentError,
    delete_knowledge_document,
    get_knowledge_document,
    get_knowledge_graph,
    get_knowledge_vector,
    query_knowledge_documents,
    query_knowledge_vectors,
    search_knowledge_graph,
    upload_knowledge_documents,
)


async def query_knowledge_documents_handler(
    page: int,
    size: int,
    status: KnowledgeDocumentStatus | None,
) -> CommonResponse:
    result = await query_knowledge_documents(page=page, size=size, status=status)
    return CommonResponse(data=result)


async def get_knowledge_document_handler(document_id: str) -> CommonResponse:
    document = await get_knowledge_document(document_id)
    if document is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "knowledge document not found")
    return CommonResponse(data=document)


async def upload_knowledge_documents_handler(
    files: list[UploadFile],
) -> CommonResponse:
    try:
        result = await upload_knowledge_documents(files)
    except KnowledgeDocumentError as exc:
        raise_api_error(HTTPStatus.BAD_REQUEST, str(exc))
    if result.track_ids:
        request_knowledge_document_processing(result.track_ids)
    if result.queued_files and result.rejected_files:
        message = "knowledge documents partially queued"
    elif result.queued_files:
        message = "knowledge documents queued"
    else:
        message = "no knowledge documents queued"
    return CommonResponse(message=message, data=result)


async def delete_knowledge_document_handler(document_id: str) -> CommonResponse:
    result = await delete_knowledge_document(document_id)
    if result.status != "success":
        raise_api_error(result.status_code, result.message)
    return CommonResponse(
        message="knowledge document deleted",
        data=DeleteKnowledgeDocumentResponse(id=document_id),
    )


async def query_knowledge_vectors_handler(page: int, size: int) -> CommonResponse:
    result = await query_knowledge_vectors(page=page, size=size)
    return CommonResponse(data=result)


async def get_knowledge_vector_handler(vector_id: str) -> CommonResponse:
    vector = await get_knowledge_vector(vector_id)
    if vector is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "knowledge vector not found")
    return CommonResponse(data=vector)


async def get_knowledge_graph_handler(
    query: str,
    max_depth: int,
    max_nodes: int,
) -> CommonResponse:
    result = await get_knowledge_graph(
        query=query,
        max_depth=max_depth,
        max_nodes=max_nodes,
    )
    return CommonResponse(data=result)


async def search_knowledge_graph_handler(query: str, max_nodes: int) -> CommonResponse:
    try:
        result = await search_knowledge_graph(query=query, max_nodes=max_nodes)
    except KnowledgeDocumentError as exc:
        raise_api_error(HTTPStatus.BAD_REQUEST, str(exc))
    return CommonResponse(data=result)
