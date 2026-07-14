from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete as sa_delete
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.findings import WorkProjectFinding
from model.work_project.graph import (
    WorkProjectAttackPath,
    WorkProjectAttackPathStep,
    WorkProjectGraphEdge,
)
from schema.work_project.graph import (
    WorkProjectAttackPathRequest,
    WorkProjectAttackPathSchema,
    WorkProjectAttackPathStepRequest,
    WorkProjectAttackPathStepSchema,
    WorkProjectGraphEdgeRequest,
    WorkProjectGraphEdgeSchema,
)
from service.common.pagination import page_offset
from service.work_project.locking import lock_active_work_project


@dataclass(frozen=True, slots=True)
class WorkProjectGraphPage:
    page: int
    size: int
    edge_total: int
    attack_path_total: int
    attack_path_step_total: int
    edges: list[WorkProjectGraphEdgeSchema]
    attack_paths: list[WorkProjectAttackPathSchema]
    attack_path_steps: list[WorkProjectAttackPathStepSchema]


async def query_work_project_graph(
    project_id: int,
    *,
    page: int,
    size: int,
) -> WorkProjectGraphPage:
    offset = page_offset(page, size)
    edge_filter = WorkProjectGraphEdge.project_id == project_id
    path_filter = WorkProjectAttackPath.project_id == project_id
    step_filter = WorkProjectAttackPathStep.project_id == project_id

    counts_statement = select(
        select(func.count()).select_from(WorkProjectGraphEdge).where(edge_filter).scalar_subquery(),
        select(func.count()).select_from(WorkProjectAttackPath).where(path_filter).scalar_subquery(),
        select(func.count()).select_from(WorkProjectAttackPathStep).where(step_filter).scalar_subquery(),
    )
    async with get_async_session() as session:
        edge_total, path_total, step_total = (await session.exec(counts_statement)).one()
        edges = (await session.exec(
            select(WorkProjectGraphEdge)
            .where(edge_filter)
            .order_by(WorkProjectGraphEdge.id)
            .offset(offset)
            .limit(size)
        )).all()
        attack_paths = (await session.exec(
            select(WorkProjectAttackPath)
            .where(path_filter)
            .order_by(WorkProjectAttackPath.id)
            .offset(offset)
            .limit(size)
        )).all()
        attack_path_steps = (await session.exec(
            select(WorkProjectAttackPathStep)
            .where(step_filter)
            .order_by(WorkProjectAttackPathStep.path_id, WorkProjectAttackPathStep.sequence)
            .offset(offset)
            .limit(size)
        )).all()

    return WorkProjectGraphPage(
        page=page,
        size=size,
        edge_total=int(edge_total),
        attack_path_total=int(path_total),
        attack_path_step_total=int(step_total),
        edges=[WorkProjectGraphEdgeSchema.model_validate(item) for item in edges],
        attack_paths=[WorkProjectAttackPathSchema.model_validate(item) for item in attack_paths],
        attack_path_steps=[WorkProjectAttackPathStepSchema.model_validate(item) for item in attack_path_steps],
    )


# ---------------------------------------------------------------------------
# Graph edges (asset -> asset relationships)
# ---------------------------------------------------------------------------
async def upsert_work_project_graph_edge(
    project_id: int,
    request: WorkProjectGraphEdgeRequest,
    *,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectGraphEdgeSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        error = await _validate_edge_assets(session, project_id, request)
        if error:
            return None, error
        edge = await _get_edge_by_relation(session, project_id, request)
        now = datetime.now()
        if edge is None:
            edge = WorkProjectGraphEdge(
                project_id=project_id,
                source_asset_id=request.source_asset_id,
                target_asset_id=request.target_asset_id,
                type=request.type,
                label=request.label,
                created_by_agent_code=created_by_agent_code.strip(),
                created_from_session_id=created_from_session_id.strip(),
                created_at=now,
                updated_at=now,
            )
        else:
            edge.label = request.label
            edge.updated_at = now
        session.add(edge)
        try:
            await session.commit()
        except IntegrityError:
            # Lost a concurrent create race: re-read the winning edge and apply the label.
            await session.rollback()
            if error := await lock_active_work_project(session, project_id):
                return None, error
            error = await _validate_edge_assets(session, project_id, request)
            if error:
                return None, error
            edge = await _get_edge_by_relation(session, project_id, request)
            if edge is None:
                return None, "graph edge already exists"
            edge.label = request.label
            edge.updated_at = datetime.now()
            session.add(edge)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return None, "graph edge already exists"
        await session.refresh(edge)
    return WorkProjectGraphEdgeSchema.model_validate(edge), ""


async def update_work_project_graph_edge(
    project_id: int,
    edge_id: int,
    request: WorkProjectGraphEdgeRequest,
) -> tuple[WorkProjectGraphEdgeSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        edge = (await session.exec(
            select(WorkProjectGraphEdge).where(WorkProjectGraphEdge.id == edge_id).with_for_update()
        )).one_or_none()
        if edge is None or edge.project_id != project_id:
            return None, "graph edge not found"
        error = await _validate_edge_assets(session, project_id, request)
        if error:
            return None, error
        duplicate = await _get_edge_by_relation(session, project_id, request)
        if duplicate is not None and duplicate.id != edge_id:
            return None, "graph edge already exists"
        edge.source_asset_id = request.source_asset_id
        edge.target_asset_id = request.target_asset_id
        edge.type = request.type
        edge.label = request.label
        edge.updated_at = datetime.now()
        session.add(edge)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            error = await _validate_edge_assets(session, project_id, request)
            if error:
                return None, error
            return None, "graph edge already exists"
        await session.refresh(edge)
    return WorkProjectGraphEdgeSchema.model_validate(edge), ""


async def delete_work_project_graph_edge(project_id: int, edge_id: int) -> str:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return error
        edge = (await session.exec(
            select(WorkProjectGraphEdge).where(WorkProjectGraphEdge.id == edge_id).with_for_update()
        )).one_or_none()
        if edge is None or edge.project_id != project_id:
            return "graph edge not found"
        await _purge_edge(session, edge_id)
        await session.commit()
    return ""


async def purge_edges_touching_asset(session, project_id: int, asset_id: int) -> None:
    """Detach and delete every edge that has the asset as an endpoint. No commit."""
    edge_ids = (
        select(WorkProjectGraphEdge.id).where(
            WorkProjectGraphEdge.project_id == project_id,
            or_(
                WorkProjectGraphEdge.source_asset_id == asset_id,
                WorkProjectGraphEdge.target_asset_id == asset_id,
            ),
        )
    ).scalar_subquery()
    await session.execute(
        sa_delete(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.edge_id.in_(edge_ids))
    )
    await session.execute(
        update(WorkProjectFinding)
        .where(WorkProjectFinding.edge_id.in_(edge_ids))
        .values(edge_id=None)
    )
    await session.execute(
        sa_delete(WorkProjectGraphEdge).where(WorkProjectGraphEdge.id.in_(edge_ids))
    )


# ---------------------------------------------------------------------------
# Attack paths
# ---------------------------------------------------------------------------
async def create_work_project_attack_path(
    project_id: int,
    request: WorkProjectAttackPathRequest,
    *,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectAttackPathSchema | None, str]:
    now = datetime.now()
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        path = WorkProjectAttackPath(
            project_id=project_id,
            title=request.title,
            status=request.status,
            summary=request.summary,
            created_by_agent_code=created_by_agent_code.strip(),
            created_from_session_id=created_from_session_id.strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(path)
        await session.commit()
        await session.refresh(path)
    return WorkProjectAttackPathSchema.model_validate(path), ""


async def update_work_project_attack_path(
    project_id: int,
    path_id: int,
    request: WorkProjectAttackPathRequest,
) -> tuple[WorkProjectAttackPathSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        path = (await session.exec(
            select(WorkProjectAttackPath).where(WorkProjectAttackPath.id == path_id).with_for_update()
        )).one_or_none()
        if path is None or path.project_id != project_id:
            return None, "attack path not found"
        path.title = request.title
        path.status = request.status
        path.summary = request.summary
        path.updated_at = datetime.now()
        session.add(path)
        await session.commit()
        await session.refresh(path)
    return WorkProjectAttackPathSchema.model_validate(path), ""


async def delete_work_project_attack_path(project_id: int, path_id: int) -> str:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return error
        path = (await session.exec(
            select(WorkProjectAttackPath).where(WorkProjectAttackPath.id == path_id).with_for_update()
        )).one_or_none()
        if path is None or path.project_id != project_id:
            return "attack path not found"
        await session.execute(
            sa_delete(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.path_id == path_id)
        )
        await session.delete(path)
        await session.commit()
    return ""


# ---------------------------------------------------------------------------
# Attack path steps (ordered edges)
# ---------------------------------------------------------------------------
async def create_work_project_attack_path_step(
    project_id: int,
    path_id: int,
    request: WorkProjectAttackPathStepRequest,
    *,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectAttackPathStepSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        error = await _validate_step_refs(session, project_id, path_id, request)
        if error:
            return None, error
        if await _get_step_by_sequence(session, project_id, path_id, request.sequence) is not None:
            return None, "attack path step already exists"
        now = datetime.now()
        step = WorkProjectAttackPathStep(
            project_id=project_id,
            path_id=path_id,
            sequence=request.sequence,
            edge_id=request.edge_id,
            created_by_agent_code=created_by_agent_code.strip(),
            created_from_session_id=created_from_session_id.strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(step)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            error = await _validate_step_refs(session, project_id, path_id, request)
            if error:
                return None, error
            return None, "attack path step already exists"
        await session.refresh(step)
    return WorkProjectAttackPathStepSchema.model_validate(step), ""


async def update_work_project_attack_path_step(
    project_id: int,
    path_id: int,
    step_id: int,
    request: WorkProjectAttackPathStepRequest,
) -> tuple[WorkProjectAttackPathStepSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        step = (await session.exec(
            select(WorkProjectAttackPathStep)
            .where(WorkProjectAttackPathStep.id == step_id)
            .with_for_update()
        )).one_or_none()
        if step is None or step.project_id != project_id or step.path_id != path_id:
            return None, "attack path step not found"
        error = await _validate_step_refs(session, project_id, path_id, request)
        if error:
            return None, error
        existing = await _get_step_by_sequence(session, project_id, path_id, request.sequence)
        if existing is not None and existing.id != step_id:
            return None, "attack path step already exists"
        step.sequence = request.sequence
        step.edge_id = request.edge_id
        step.updated_at = datetime.now()
        session.add(step)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            error = await _validate_step_refs(session, project_id, path_id, request)
            if error:
                return None, error
            return None, "attack path step already exists"
        await session.refresh(step)
    return WorkProjectAttackPathStepSchema.model_validate(step), ""


async def delete_work_project_attack_path_step(project_id: int, path_id: int, step_id: int) -> str:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return error
        step = (await session.exec(
            select(WorkProjectAttackPathStep)
            .where(WorkProjectAttackPathStep.id == step_id)
            .with_for_update()
        )).one_or_none()
        if step is None or step.project_id != project_id or step.path_id != path_id:
            return "attack path step not found"
        await session.delete(step)
        await session.commit()
    return ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
async def _purge_edge(session, edge_id: int) -> None:
    await session.execute(
        sa_delete(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.edge_id == edge_id)
    )
    await session.execute(
        update(WorkProjectFinding).where(WorkProjectFinding.edge_id == edge_id).values(edge_id=None)
    )
    edge = await session.get(WorkProjectGraphEdge, edge_id)
    if edge is not None:
        await session.delete(edge)


async def _get_edge_by_relation(session, project_id: int, request: WorkProjectGraphEdgeRequest) -> WorkProjectGraphEdge | None:
    return (await session.exec(
        select(WorkProjectGraphEdge).where(
            WorkProjectGraphEdge.project_id == project_id,
            WorkProjectGraphEdge.source_asset_id == request.source_asset_id,
            WorkProjectGraphEdge.target_asset_id == request.target_asset_id,
            WorkProjectGraphEdge.type == request.type,
        ).with_for_update()
    )).first()


async def _get_step_by_sequence(session, project_id: int, path_id: int, sequence: int) -> WorkProjectAttackPathStep | None:
    return (await session.exec(
        select(WorkProjectAttackPathStep).where(
            WorkProjectAttackPathStep.project_id == project_id,
            WorkProjectAttackPathStep.path_id == path_id,
            WorkProjectAttackPathStep.sequence == sequence,
        ).with_for_update()
    )).first()


async def _validate_edge_assets(session, project_id: int, request: WorkProjectGraphEdgeRequest) -> str:
    for asset_id, label in (
        (request.source_asset_id, "source asset"),
        (request.target_asset_id, "target asset"),
    ):
        asset = await session.get(WorkProjectAsset, asset_id)
        if asset is None or asset.project_id != project_id:
            return f"{label} not found"
    return ""


async def _validate_step_refs(session, project_id: int, path_id: int, request: WorkProjectAttackPathStepRequest) -> str:
    path = await session.get(WorkProjectAttackPath, path_id)
    if path is None or path.project_id != project_id:
        return "attack path not found"
    edge = await session.get(WorkProjectGraphEdge, request.edge_id)
    if edge is None or edge.project_id != project_id:
        return "graph edge not found"
    return ""
