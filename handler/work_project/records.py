from http import HTTPStatus

from handler.common.http import raise_api_error
from middleware.auth import AuthUser
from schema.common.responses import CommonResponse
from schema.work_project.records import (
    QueryWorkProjectAssetsResponse,
    QueryWorkProjectAttackPathsResponse,
    QueryWorkProjectFindingsResponse,
)
from service.common.pagination import paginated_payload
from service.work_project.records import (
    get_work_project_graph_for_user,
    query_work_project_assets_for_user,
    query_work_project_attack_paths_for_user,
    query_work_project_findings_for_user,
)


async def query_work_project_assets_handler(
    id: int,
    page: int,
    size: int,
    keyword: str,
    user: AuthUser,
) -> CommonResponse:
    result = await query_work_project_assets_for_user(
        id,
        page=page,
        size=size,
        keyword=keyword,
        user_id=user.id,
        user_role=user.role,
    )
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=QueryWorkProjectAssetsResponse(
        **paginated_payload(result, result.items),
    ))


async def query_work_project_findings_handler(
    id: int,
    page: int,
    size: int,
    user: AuthUser,
) -> CommonResponse:
    result = await query_work_project_findings_for_user(
        id,
        page=page,
        size=size,
        user_id=user.id,
        user_role=user.role,
    )
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=QueryWorkProjectFindingsResponse(
        **paginated_payload(result, result.items),
    ))


async def query_work_project_attack_paths_handler(
    id: int,
    page: int,
    size: int,
    user: AuthUser,
) -> CommonResponse:
    result = await query_work_project_attack_paths_for_user(
        id,
        page=page,
        size=size,
        user_id=user.id,
        user_role=user.role,
    )
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=QueryWorkProjectAttackPathsResponse(
        **paginated_payload(result, result.items),
    ))


async def get_work_project_graph_handler(id: int, user: AuthUser) -> CommonResponse:
    result = await get_work_project_graph_for_user(
        id,
        user_id=user.id,
        user_role=user.role,
    )
    if result is None:
        raise_api_error(HTTPStatus.NOT_FOUND, "work project not found")
    return CommonResponse(data=result)
