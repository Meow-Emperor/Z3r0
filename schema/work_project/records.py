from pydantic import BaseModel, Field

from schema.common.responses import PaginatedResponse
from schema.work_project.assets import WorkProjectAssetSchema
from schema.work_project.evidence import WorkProjectEvidenceSchema
from schema.work_project.findings import WorkProjectFindingAssetLinkSchema, WorkProjectFindingSchema
from schema.work_project.graph import (
    WorkProjectAttackPathSchema,
    WorkProjectAttackPathStatus,
    WorkProjectAttackPathStepSchema,
    WorkProjectRelationSchema,
)
from schema.work_project.workflow import (
    WorkProjectWorkItemSchema,
    WorkProjectWorkItemTargetSchema,
    WorkProjectWorkLogSchema,
)


class WorkProjectOverviewSchema(BaseModel):
    asset_total: int = Field(ge=0)
    in_scope_asset_total: int = Field(ge=0)
    untouched_asset_total: int = Field(ge=0)
    covered_target_total: int = Field(ge=0)
    blocked_target_total: int = Field(ge=0)
    work_item_status_counts: dict[str, int]
    finding_verification_counts: dict[str, int]
    attack_path_status_counts: dict[str, int]
    evidence_total: int = Field(ge=0)
    running_agent_count: int = Field(ge=0)


class WorkProjectEvidenceRecordSchema(BaseModel):
    evidence: WorkProjectEvidenceSchema
    primary_asset: WorkProjectAssetSchema | None = None


class WorkProjectFindingRecordSchema(BaseModel):
    finding: WorkProjectFindingSchema
    primary_asset: WorkProjectAssetSchema
    affected_assets: list[WorkProjectAssetSchema]
    asset_links: list[WorkProjectFindingAssetLinkSchema]
    evidence: list[WorkProjectEvidenceSchema]


class WorkProjectAttackPathRecordSchema(BaseModel):
    path: WorkProjectAttackPathSchema
    status: WorkProjectAttackPathStatus
    steps: list[WorkProjectAttackPathStepSchema]
    assets: list[WorkProjectAssetSchema]
    evidence: list[WorkProjectEvidenceSchema]


class WorkProjectWorkItemRecordSchema(BaseModel):
    work_item: WorkProjectWorkItemSchema
    targets: list[WorkProjectWorkItemTargetSchema]
    target_assets: list[WorkProjectAssetSchema]
    dependency_ids: list[int]
    evidence: list[WorkProjectEvidenceSchema]
    recent_logs: list[WorkProjectWorkLogSchema]
    work_log_total: int = Field(ge=0)
    subordinate_run_ids: list[str]


class QueryWorkProjectAssetsResponse(PaginatedResponse[WorkProjectAssetSchema]):
    pass


class QueryWorkProjectEvidenceResponse(PaginatedResponse[WorkProjectEvidenceRecordSchema]):
    pass


class QueryWorkProjectFindingsResponse(PaginatedResponse[WorkProjectFindingRecordSchema]):
    pass


class QueryWorkProjectAttackPathsResponse(PaginatedResponse[WorkProjectAttackPathRecordSchema]):
    pass


class QueryWorkProjectWorkItemsResponse(PaginatedResponse[WorkProjectWorkItemRecordSchema]):
    pass


class QueryWorkProjectActivityResponse(PaginatedResponse[WorkProjectWorkLogSchema]):
    pass


class WorkProjectGraphViewSchema(BaseModel):
    assets: list[WorkProjectAssetSchema]
    relations: list[WorkProjectRelationSchema]
    finding_counts: dict[int, int]
    active_work_item_counts: dict[int, int]
    attack_path_counts: dict[int, int]
    is_truncated: bool = False
