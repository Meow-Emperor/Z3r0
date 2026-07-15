from http import HTTPStatus

from handler.common.http import raise_api_error
from middleware.auth import AuthUser
from schema.common.responses import CommonResponse
from schema.work_project.assets import WorkProjectAssetKind, WorkProjectAssetScope
from schema.work_project.evidence import WorkProjectEvidenceKind, WorkProjectEvidenceStatus
from schema.work_project.findings import WorkProjectFindingSeverity, WorkProjectFindingVerification
from schema.work_project.records import (
    QueryWorkProjectActivityResponse,
    QueryWorkProjectAssetsResponse,
    QueryWorkProjectAttackPathsResponse,
    QueryWorkProjectEvidenceResponse,
    QueryWorkProjectFindingsResponse,
    QueryWorkProjectWorkItemsResponse,
)
from schema.work_project.workflow import WorkProjectWorkItemStatus
from service.common.pagination import paginated_payload
from service.work_project.records import (
    get_work_project_graph_for_user,
    get_work_project_overview_for_user,
    query_work_project_activity_for_user,
    query_work_project_assets_for_user,
    query_work_project_attack_paths_for_user,
    query_work_project_evidence_for_user,
    query_work_project_findings_for_user,
    query_work_project_work_items_for_user,
)


async def _page_response(query, response_model, project_id: int, page: int, size: int, user: AuthUser, **kwargs):
    result = await query(project_id, page=page, size=size, user_id=user.id, user_role=user.role, **kwargs)
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=response_model(**paginated_payload(result, result.items)))


async def get_work_project_overview_handler(id: int, user: AuthUser) -> CommonResponse:
    result = await get_work_project_overview_for_user(id, user_id=user.id, user_role=user.role)
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=result)


async def query_work_project_assets_handler(
    id: int,
    page: int,
    size: int,
    keyword: str,
    kind: WorkProjectAssetKind | None,
    scope: WorkProjectAssetScope | None,
    user: AuthUser,
) -> CommonResponse:
    return await _page_response(
        query_work_project_assets_for_user,
        QueryWorkProjectAssetsResponse,
        id,
        page,
        size,
        user,
        keyword=keyword,
        kind=kind,
        scope=scope,
    )


async def query_work_project_evidence_handler(
    id: int,
    page: int,
    size: int,
    keyword: str,
    kind: WorkProjectEvidenceKind | None,
    status: WorkProjectEvidenceStatus | None,
    user: AuthUser,
) -> CommonResponse:
    return await _page_response(
        query_work_project_evidence_for_user,
        QueryWorkProjectEvidenceResponse,
        id,
        page,
        size,
        user,
        keyword=keyword,
        kind=kind,
        status=status,
    )


async def query_work_project_findings_handler(
    id: int,
    page: int,
    size: int,
    keyword: str,
    verification: WorkProjectFindingVerification | None,
    severity: WorkProjectFindingSeverity | None,
    user: AuthUser,
) -> CommonResponse:
    return await _page_response(
        query_work_project_findings_for_user,
        QueryWorkProjectFindingsResponse,
        id,
        page,
        size,
        user,
        keyword=keyword,
        verification=verification,
        severity=severity,
    )


async def query_work_project_attack_paths_handler(id: int, page: int, size: int, keyword: str, user: AuthUser) -> CommonResponse:
    return await _page_response(
        query_work_project_attack_paths_for_user,
        QueryWorkProjectAttackPathsResponse,
        id,
        page,
        size,
        user,
        keyword=keyword,
    )


async def query_work_project_work_items_handler(
    id: int,
    page: int,
    size: int,
    keyword: str,
    status: WorkProjectWorkItemStatus | None,
    assignee_agent_code: str,
    user: AuthUser,
) -> CommonResponse:
    return await _page_response(
        query_work_project_work_items_for_user,
        QueryWorkProjectWorkItemsResponse,
        id,
        page,
        size,
        user,
        keyword=keyword,
        status=status,
        assignee_agent_code=assignee_agent_code,
    )


async def query_work_project_activity_handler(id: int, page: int, size: int, user: AuthUser) -> CommonResponse:
    return await _page_response(query_work_project_activity_for_user, QueryWorkProjectActivityResponse, id, page, size, user)


async def get_work_project_graph_handler(id: int, user: AuthUser) -> CommonResponse:
    result = await get_work_project_graph_for_user(id, user_id=user.id, user_role=user.role)
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=result)
