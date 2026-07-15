from fastapi import APIRouter, Depends, File, Path, Query, UploadFile

from handler.knowledge.resources import (
    delete_knowledge_document_handler,
    get_knowledge_document_handler,
    get_knowledge_graph_handler,
    get_knowledge_vector_handler,
    query_knowledge_documents_handler,
    query_knowledge_vectors_handler,
    search_knowledge_graph_handler,
    upload_knowledge_documents_handler,
)
from middleware.system_user import require_admin
from router.common.responses import (
    BAD_REQUEST_RESPONSE,
    COMMON_ERROR_RESPONSES,
    not_found_response,
)
from schema.common.responses import CommonResponse
from schema.knowledge.resources import (
    DeleteKnowledgeDocumentResponse,
    KnowledgeDocumentDetailSchema,
    KnowledgeDocumentStatus,
    KnowledgeGraphSchema,
    KnowledgeVectorDetailSchema,
    QueryKnowledgeDocumentsResponse,
    QueryKnowledgeVectorsResponse,
    UploadKnowledgeDocumentsResponse,
)
from service.common.pagination import RESOURCE_PAGE_MAX_SIZE, RESOURCE_PAGE_SIZE
from service.knowledge.constants import KNOWLEDGE_GRAPH_MAX_NODES


router = APIRouter(
    prefix="/knowledges",
    tags=["knowledges"],
    dependencies=[Depends(require_admin)],
)

NOT_FOUND_RESPONSE = not_found_response("Knowledge document")


async def query_knowledge_documents_route(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=RESOURCE_PAGE_SIZE, ge=1, le=RESOURCE_PAGE_MAX_SIZE),
    status: KnowledgeDocumentStatus | None = Query(default=None),
) -> CommonResponse[QueryKnowledgeDocumentsResponse]:
    return await query_knowledge_documents_handler(page, size, status)


async def upload_knowledge_documents_route(
    files: list[UploadFile] = File(...),
) -> CommonResponse[UploadKnowledgeDocumentsResponse]:
    return await upload_knowledge_documents_handler(files)


async def get_knowledge_document_route(
    document_id: str = Path(min_length=1, max_length=128),
) -> CommonResponse[KnowledgeDocumentDetailSchema]:
    return await get_knowledge_document_handler(document_id)


async def delete_knowledge_document_route(
    document_id: str = Path(min_length=1, max_length=128),
) -> CommonResponse[DeleteKnowledgeDocumentResponse]:
    return await delete_knowledge_document_handler(document_id)


async def query_knowledge_vectors_route(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=RESOURCE_PAGE_SIZE, ge=1, le=RESOURCE_PAGE_MAX_SIZE),
) -> CommonResponse[QueryKnowledgeVectorsResponse]:
    return await query_knowledge_vectors_handler(page, size)


async def get_knowledge_vector_route(
    vector_id: str = Path(min_length=1, max_length=128),
) -> CommonResponse[KnowledgeVectorDetailSchema]:
    return await get_knowledge_vector_handler(vector_id)


async def get_knowledge_graph_route(
    query: str = Query(default=""),
    max_depth: int = Query(default=2, ge=1, le=5),
    max_nodes: int = Query(
        default=KNOWLEDGE_GRAPH_MAX_NODES,
        ge=1,
        le=KNOWLEDGE_GRAPH_MAX_NODES,
    ),
) -> CommonResponse[KnowledgeGraphSchema]:
    return await get_knowledge_graph_handler(query, max_depth, max_nodes)


async def search_knowledge_graph_route(
    query: str = Query(min_length=1, max_length=1000),
    max_nodes: int = Query(
        default=KNOWLEDGE_GRAPH_MAX_NODES,
        ge=1,
        le=KNOWLEDGE_GRAPH_MAX_NODES,
    ),
) -> CommonResponse[KnowledgeGraphSchema]:
    return await search_knowledge_graph_handler(query, max_nodes)


router.add_api_route(
    "/documents",
    query_knowledge_documents_route,
    methods=["GET"],
    response_model=CommonResponse[QueryKnowledgeDocumentsResponse],
    responses=COMMON_ERROR_RESPONSES,
)
router.add_api_route(
    "/documents",
    upload_knowledge_documents_route,
    methods=["POST"],
    response_model=CommonResponse[UploadKnowledgeDocumentsResponse],
    responses={**COMMON_ERROR_RESPONSES, **BAD_REQUEST_RESPONSE},
)
router.add_api_route(
    "/documents/{document_id}",
    get_knowledge_document_route,
    methods=["GET"],
    response_model=CommonResponse[KnowledgeDocumentDetailSchema],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
router.add_api_route(
    "/documents/{document_id}",
    delete_knowledge_document_route,
    methods=["DELETE"],
    response_model=CommonResponse[DeleteKnowledgeDocumentResponse],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
router.add_api_route(
    "/vectors",
    query_knowledge_vectors_route,
    methods=["GET"],
    response_model=CommonResponse[QueryKnowledgeVectorsResponse],
    responses=COMMON_ERROR_RESPONSES,
)
router.add_api_route(
    "/vectors/{vector_id}",
    get_knowledge_vector_route,
    methods=["GET"],
    response_model=CommonResponse[KnowledgeVectorDetailSchema],
    responses={**COMMON_ERROR_RESPONSES, **not_found_response("Knowledge vector")},
)
router.add_api_route(
    "/graph",
    get_knowledge_graph_route,
    methods=["GET"],
    response_model=CommonResponse[KnowledgeGraphSchema],
    responses=COMMON_ERROR_RESPONSES,
)
router.add_api_route(
    "/graph/search",
    search_knowledge_graph_route,
    methods=["GET"],
    response_model=CommonResponse[KnowledgeGraphSchema],
    responses={**COMMON_ERROR_RESPONSES, **BAD_REQUEST_RESPONSE},
)
