from fastapi import APIRouter, Depends, Query

from handler.work_project.records import (
    get_work_project_graph_handler,
    query_work_project_assets_handler,
    query_work_project_attack_paths_handler,
    query_work_project_findings_handler,
)
from middleware.auth import AuthUser, require_user
from router.common.responses import COMMON_ERROR_RESPONSES, not_found_response
from schema.common.responses import CommonResponse
from schema.work_project.records import (
    QueryWorkProjectAssetsResponse,
    QueryWorkProjectAttackPathsResponse,
    QueryWorkProjectFindingsResponse,
    WorkProjectGraphViewSchema,
)
from service.common.pagination import RESOURCE_PAGE_MAX_SIZE, RESOURCE_PAGE_SIZE


NOT_FOUND_RESPONSE = not_found_response("Work project")

router = APIRouter(
    prefix="/work-projects/{id}",
    tags=["work-project-records"],
    dependencies=[Depends(require_user)],
)


@router.get(
    "/assets",
    response_model=CommonResponse[QueryWorkProjectAssetsResponse],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
async def query_work_project_assets_route(
    id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=RESOURCE_PAGE_SIZE, ge=1, le=RESOURCE_PAGE_MAX_SIZE),
    keyword: str = Query(default=""),
    user: AuthUser = Depends(require_user),
) -> CommonResponse:
    return await query_work_project_assets_handler(id, page, size, keyword, user)


@router.get(
    "/findings",
    response_model=CommonResponse[QueryWorkProjectFindingsResponse],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
async def query_work_project_findings_route(
    id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=RESOURCE_PAGE_SIZE, ge=1, le=RESOURCE_PAGE_MAX_SIZE),
    user: AuthUser = Depends(require_user),
) -> CommonResponse:
    return await query_work_project_findings_handler(id, page, size, user)


@router.get(
    "/attack-paths",
    response_model=CommonResponse[QueryWorkProjectAttackPathsResponse],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
async def query_work_project_attack_paths_route(
    id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=RESOURCE_PAGE_SIZE, ge=1, le=RESOURCE_PAGE_MAX_SIZE),
    user: AuthUser = Depends(require_user),
) -> CommonResponse:
    return await query_work_project_attack_paths_handler(id, page, size, user)


@router.get(
    "/graph",
    response_model=CommonResponse[WorkProjectGraphViewSchema],
    responses={**COMMON_ERROR_RESPONSES, **NOT_FOUND_RESPONSE},
)
async def get_work_project_graph_route(
    id: int,
    user: AuthUser = Depends(require_user),
) -> CommonResponse:
    return await get_work_project_graph_handler(id, user)
