import re
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkProjectEvidenceKind(StrEnum):
    OBSERVATION = "observation"
    COMMAND_OUTPUT = "command_output"
    HTTP_EXCHANGE = "http_exchange"
    CODE_LOCATION = "code_location"
    ARTIFACT = "artifact"
    EXTERNAL_SOURCE = "external_source"
    NEGATIVE_RESULT = "negative_result"
    OPERATOR_NOTE = "operator_note"


class WorkProjectEvidenceStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    INVALIDATED = "invalidated"


class WorkProjectEvidenceSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    kind: WorkProjectEvidenceKind
    title: str
    summary: str
    reference: str
    sha256: str = ""
    primary_asset_id: int | None = None
    work_item_id: int
    status: WorkProjectEvidenceStatus
    supersedes_evidence_id: int | None = None
    invalidation_reason: str = ""
    captured_at: datetime
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime


class WorkProjectEvidenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: WorkProjectEvidenceKind
    title: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=8000)
    reference: str = Field(min_length=1, max_length=2000)
    sha256: str = Field(default="", max_length=64)
    primary_asset_id: int | None = Field(default=None, gt=0)
    work_item_id: int = Field(gt=0)
    supersedes_evidence_id: int | None = Field(default=None, gt=0)
    captured_at: datetime = Field(default_factory=datetime.now)

    @field_validator("title", "summary", "reference", "sha256", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_hash(self) -> "WorkProjectEvidenceRequest":
        self.sha256 = self.sha256.lower()
        if self.sha256 and not re.fullmatch(r"[0-9a-f]{64}", self.sha256):
            raise ValueError("sha256 must be a 64-character hexadecimal digest")
        return self

