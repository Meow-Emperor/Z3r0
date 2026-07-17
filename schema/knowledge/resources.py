from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from schema.common.responses import PaginatedResponse


class KnowledgeDocumentStatus(StrEnum):
    PENDING = "pending"
    PARSING = "parsing"
    ANALYZING = "analyzing"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"


KNOWLEDGE_DOCUMENT_INFLIGHT_STATUSES = (
    KnowledgeDocumentStatus.PENDING,
    KnowledgeDocumentStatus.PARSING,
    KnowledgeDocumentStatus.ANALYZING,
    KnowledgeDocumentStatus.PROCESSING,
)


class KnowledgeDocumentStatusCounts(BaseModel):
    total: int = Field(ge=0)
    pending: int = Field(ge=0)
    parsing: int = Field(ge=0)
    analyzing: int = Field(ge=0)
    processing: int = Field(ge=0)
    processed: int = Field(ge=0)
    failed: int = Field(ge=0)


class KnowledgeDocumentSchema(BaseModel):
    id: str
    file_name: str
    status: KnowledgeDocumentStatus
    content_summary: str
    content_length: int = Field(ge=0)
    chunks_count: int = Field(ge=0)
    track_id: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class QueryKnowledgeDocumentsResponse(PaginatedResponse[KnowledgeDocumentSchema]):
    status_counts: KnowledgeDocumentStatusCounts


class KnowledgeDocumentDetailSchema(KnowledgeDocumentSchema):
    content: str
    chunk_ids: list[str]
    metadata: dict[str, Any]
    content_hash: str | None = None
    parse_format: str | None = None
    parse_engine: str | None = None
    process_options: str | None = None
    chunk_options: dict[str, Any]


class RejectedKnowledgeDocumentUpload(BaseModel):
    file_name: str
    message: str


class UploadKnowledgeDocumentsResponse(BaseModel):
    track_ids: list[str]
    queued_files: list[str]
    rejected_files: list[RejectedKnowledgeDocumentUpload]


class DeleteKnowledgeDocumentResponse(BaseModel):
    id: str


class KnowledgeVectorSchema(BaseModel):
    id: str
    document_id: str
    chunk_index: int = Field(ge=0)
    tokens: int = Field(ge=0)
    content: str
    file_name: str
    dimension: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class QueryKnowledgeVectorsResponse(PaginatedResponse[KnowledgeVectorSchema]):
    pass


class KnowledgeVectorDetailSchema(KnowledgeVectorSchema):
    heading: dict[str, Any]
    source_metadata: dict[str, Any]


class KnowledgeGraphNodeSchema(BaseModel):
    id: str
    labels: list[str]
    properties: dict[str, Any]
    matched: bool = False


class KnowledgeGraphEdgeSchema(BaseModel):
    id: str
    type: str
    source: str
    target: str
    properties: dict[str, Any]


class KnowledgeGraphSchema(BaseModel):
    nodes: list[KnowledgeGraphNodeSchema]
    edges: list[KnowledgeGraphEdgeSchema]
    is_truncated: bool
