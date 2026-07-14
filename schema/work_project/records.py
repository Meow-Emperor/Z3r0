from pydantic import BaseModel

from schema.common.responses import PaginatedResponse
from schema.work_project.assets import WorkProjectAssetSchema
from schema.work_project.findings import WorkProjectFindingSchema
from schema.work_project.graph import (
    WorkProjectAttackPathSchema,
    WorkProjectAttackPathStepSchema,
    WorkProjectGraphEdgeSchema,
)


class WorkProjectFindingRecordSchema(BaseModel):
    finding: WorkProjectFindingSchema
    asset: WorkProjectAssetSchema | None = None


class WorkProjectAttackPathRecordSchema(BaseModel):
    path: WorkProjectAttackPathSchema
    steps: list[WorkProjectAttackPathStepSchema]
    edges: list[WorkProjectGraphEdgeSchema]
    assets: list[WorkProjectAssetSchema]


class QueryWorkProjectAssetsResponse(PaginatedResponse[WorkProjectAssetSchema]):
    pass


class QueryWorkProjectFindingsResponse(PaginatedResponse[WorkProjectFindingRecordSchema]):
    pass


class QueryWorkProjectAttackPathsResponse(PaginatedResponse[WorkProjectAttackPathRecordSchema]):
    pass


class WorkProjectGraphViewSchema(BaseModel):
    assets: list[WorkProjectAssetSchema]
    edges: list[WorkProjectGraphEdgeSchema]
    is_truncated: bool = False
