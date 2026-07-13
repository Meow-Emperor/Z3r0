from datetime import datetime
from typing import Any

from lightrag.base import DocStatus
from pydantic import BaseModel, Field

from schema.common.responses import PaginatedResponse


class KnowledgeDocumentSchema(BaseModel):
    id: str
    file_name: str
    status: DocStatus
    content_summary: str
    content_length: int = Field(ge=0)
    chunks_count: int = Field(ge=0)
    track_id: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class QueryKnowledgeDocumentsResponse(PaginatedResponse[KnowledgeDocumentSchema]):
    status_counts: dict[str, int]


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
