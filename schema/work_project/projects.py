from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from schema.agent.sessions import AgentSessionSummarySchema
from schema.common.responses import PaginatedResponse
from schema.sandbox.containers import SandboxContainerSchema
from schema.system_user.users import SystemUserRole
from schema.work_project.assets import WorkProjectAssetRequest, WorkProjectAssetSchema


class WorkProjectStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELED = "canceled"


class WorkProjectType(StrEnum):
    PENETRATION_TEST = "penetration_test"
    SOURCE_CODE_AUDIT = "source_code_audit"


class WorkProjectOwnerSchema(BaseModel):
    id: int
    role: SystemUserRole
    username: str


class WorkProjectSummarySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    owner_user_ids: list[int]
    owners: list[WorkProjectOwnerSchema]
    sandbox_container_id: int | None = None
    sandbox_container: SandboxContainerSchema | None = None
    asset_count: int = Field(default=0, ge=0)
    in_scope_asset_count: int = Field(default=0, ge=0)
    untouched_asset_count: int = Field(default=0, ge=0)
    work_item_count: int = Field(default=0, ge=0)
    active_work_item_count: int = Field(default=0, ge=0)
    blocked_work_item_count: int = Field(default=0, ge=0)
    validated_finding_count: int = Field(default=0, ge=0)
    active_attack_path_count: int = Field(default=0, ge=0)
    session_count: int = Field(default=0, ge=0)
    status: WorkProjectStatus
    can_create_session: bool = False
    can_cancel: bool = False
    can_retry: bool = False
    type: WorkProjectType
    created_at: datetime
    updated_at: datetime


class WorkProjectSchema(WorkProjectSummarySchema):
    assets: list[WorkProjectAssetSchema]


class WorkProjectMetadataRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    owner_user_ids: list[int] = Field(default_factory=list, max_length=100)
    sandbox_container_id: int | None = Field(default=None, gt=0)
    assets: list[WorkProjectAssetRequest] = Field(min_length=1, max_length=500)
    type: WorkProjectType = WorkProjectType.PENETRATION_TEST

    @field_validator("name", "description", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("owner_user_ids", mode="after")
    @classmethod
    def normalize_owner_user_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(item for item in value if item > 0))

    @field_validator("assets", mode="after")
    @classmethod
    def normalize_scope_assets(cls, value: list[WorkProjectAssetRequest]) -> list[WorkProjectAssetRequest]:
        identities: set[tuple] = set()
        for asset in value:
            if asset.identity in identities:
                raise ValueError("project scope contains a duplicate asset")
            identities.add(asset.identity)
        return value


class CreateWorkProjectRequest(WorkProjectMetadataRequest):
    pass


class UpdateWorkProjectMetadataRequest(WorkProjectMetadataRequest):
    pass


class DeleteWorkProjectResponse(BaseModel):
    id: int


class CreateWorkProjectSessionResponse(BaseModel):
    session_id: str


class ListWorkProjectSessionsResponse(PaginatedResponse[AgentSessionSummarySchema]):
    pass


class QueryWorkProjectsResponse(PaginatedResponse[WorkProjectSummarySchema]):
    pass
