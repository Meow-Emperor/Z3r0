"""Bounded, user-visible WorkProject record queries."""

from sqlmodel import select

from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.findings import WorkProjectFinding
from model.work_project.graph import (
    WorkProjectAttackPath,
    WorkProjectAttackPathStep,
    WorkProjectGraphEdge,
)
from schema.system_user.users import SystemUserRole
from schema.work_project.assets import WorkProjectAssetSchema
from schema.work_project.findings import WorkProjectFindingSchema
from schema.work_project.graph import (
    WorkProjectAttackPathSchema,
    WorkProjectAttackPathStepSchema,
    WorkProjectGraphEdgeSchema,
)
from schema.work_project.records import (
    WorkProjectAttackPathRecordSchema,
    WorkProjectFindingRecordSchema,
    WorkProjectGraphViewSchema,
)
from service.common.pagination import Page, paginate_statement
from service.work_project.assets import query_work_project_assets
from service.work_project.projects import can_access_work_project


WORK_PROJECT_GRAPH_MAX_NODES = 1_000
WORK_PROJECT_GRAPH_MAX_EDGES = 4_000


async def query_work_project_assets_for_user(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    user_id: int,
    user_role: SystemUserRole,
) -> Page[WorkProjectAssetSchema] | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    return await query_work_project_assets(
        project_id,
        page=page,
        size=size,
        keyword=keyword,
    )


async def query_work_project_findings_for_user(
    project_id: int,
    *,
    page: int,
    size: int,
    user_id: int,
    user_role: SystemUserRole,
) -> Page[WorkProjectFindingRecordSchema] | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    page_result = await paginate_statement(
        select(WorkProjectFinding)
        .where(WorkProjectFinding.project_id == project_id)
        .order_by(WorkProjectFinding.id),
        page=page,
        size=size,
    )
    asset_ids = {
        finding.asset_id
        for finding in page_result.items
        if finding.asset_id is not None
    }
    async with get_async_session() as session:
        assets = {
            asset.id: asset
            for asset in (await session.exec(
                select(WorkProjectAsset).where(WorkProjectAsset.id.in_(asset_ids))
            )).all()
        } if asset_ids else {}
    return Page(
        page=page_result.page,
        size=page_result.size,
        total=page_result.total,
        items=[
            WorkProjectFindingRecordSchema(
                finding=WorkProjectFindingSchema.model_validate(finding),
                asset=(
                    WorkProjectAssetSchema.model_validate(assets[finding.asset_id])
                    if finding.asset_id in assets
                    else None
                ),
            )
            for finding in page_result.items
        ],
    )


async def query_work_project_attack_paths_for_user(
    project_id: int,
    *,
    page: int,
    size: int,
    user_id: int,
    user_role: SystemUserRole,
) -> Page[WorkProjectAttackPathRecordSchema] | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    page_result = await paginate_statement(
        select(WorkProjectAttackPath)
        .where(WorkProjectAttackPath.project_id == project_id)
        .order_by(WorkProjectAttackPath.id),
        page=page,
        size=size,
    )
    path_ids = [path.id for path in page_result.items if path.id is not None]
    if not path_ids:
        return Page(page=page, size=size, total=page_result.total, items=[])

    async with get_async_session() as session:
        steps = list((await session.exec(
            select(WorkProjectAttackPathStep)
            .where(WorkProjectAttackPathStep.path_id.in_(path_ids))
            .order_by(WorkProjectAttackPathStep.path_id, WorkProjectAttackPathStep.sequence)
        )).all())
        edge_ids = {step.edge_id for step in steps}
        edges = list((await session.exec(
            select(WorkProjectGraphEdge).where(WorkProjectGraphEdge.id.in_(edge_ids))
        )).all()) if edge_ids else []
        asset_ids = {
            asset_id
            for edge in edges
            for asset_id in (edge.source_asset_id, edge.target_asset_id)
        }
        assets = list((await session.exec(
            select(WorkProjectAsset).where(WorkProjectAsset.id.in_(asset_ids))
        )).all()) if asset_ids else []

    steps_by_path: dict[int, list[WorkProjectAttackPathStep]] = {}
    for step in steps:
        steps_by_path.setdefault(step.path_id, []).append(step)
    edges_by_id = {edge.id: edge for edge in edges}
    assets_by_id = {asset.id: asset for asset in assets}
    items: list[WorkProjectAttackPathRecordSchema] = []
    for path in page_result.items:
        path_steps = steps_by_path.get(path.id or 0, [])
        path_edges = [edges_by_id[step.edge_id] for step in path_steps if step.edge_id in edges_by_id]
        path_asset_ids = {
            asset_id
            for edge in path_edges
            for asset_id in (edge.source_asset_id, edge.target_asset_id)
        }
        items.append(WorkProjectAttackPathRecordSchema(
            path=WorkProjectAttackPathSchema.model_validate(path),
            steps=[WorkProjectAttackPathStepSchema.model_validate(step) for step in path_steps],
            edges=[WorkProjectGraphEdgeSchema.model_validate(edge) for edge in path_edges],
            assets=[
                WorkProjectAssetSchema.model_validate(assets_by_id[asset_id])
                for asset_id in sorted(path_asset_ids)
                if asset_id in assets_by_id
            ],
        ))
    return Page(page=page, size=size, total=page_result.total, items=items)


async def get_work_project_graph_for_user(
    project_id: int,
    *,
    user_id: int,
    user_role: SystemUserRole,
) -> WorkProjectGraphViewSchema | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    async with get_async_session() as session:
        assets = list((await session.exec(
            select(WorkProjectAsset)
            .where(WorkProjectAsset.project_id == project_id)
            .order_by(WorkProjectAsset.id)
            .limit(WORK_PROJECT_GRAPH_MAX_NODES + 1)
        )).all())
        visible_assets = assets[:WORK_PROJECT_GRAPH_MAX_NODES]
        asset_ids = [asset.id for asset in visible_assets if asset.id is not None]
        edges = list((await session.exec(
            select(WorkProjectGraphEdge)
            .where(
                WorkProjectGraphEdge.project_id == project_id,
                WorkProjectGraphEdge.source_asset_id.in_(asset_ids),
                WorkProjectGraphEdge.target_asset_id.in_(asset_ids),
            )
            .order_by(WorkProjectGraphEdge.id)
            .limit(WORK_PROJECT_GRAPH_MAX_EDGES + 1)
        )).all()) if asset_ids else []
    return WorkProjectGraphViewSchema(
        assets=[WorkProjectAssetSchema.model_validate(asset) for asset in visible_assets],
        edges=[WorkProjectGraphEdgeSchema.model_validate(edge) for edge in edges[:WORK_PROJECT_GRAPH_MAX_EDGES]],
        is_truncated=(
            len(assets) > WORK_PROJECT_GRAPH_MAX_NODES
            or len(edges) > WORK_PROJECT_GRAPH_MAX_EDGES
        ),
    )
