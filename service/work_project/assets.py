from datetime import datetime

from sqlalchemy import String, cast, or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import WorkProjectEvidence, WorkProjectRelationEvidence
from model.work_project.findings import WorkProjectFinding, WorkProjectFindingAsset
from model.work_project.graph import WorkProjectAttackPath, WorkProjectAttackPathStep, WorkProjectRelation
from model.work_project.workflow import WorkProjectWorkItemTarget
from schema.work_project.assets import (
    WorkProjectAssetOrigin,
    WorkProjectAssetKind,
    WorkProjectAssetRequest,
    WorkProjectAssetSchema,
    WorkProjectAssetScope,
)
from service.common.pagination import Page, paginate_statement
from service.work_project.locking import lock_active_work_project


async def query_work_project_assets(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    kind: WorkProjectAssetKind | None = None,
    scope: WorkProjectAssetScope | None = None,
) -> Page[WorkProjectAssetSchema]:
    statement = select(WorkProjectAsset).where(WorkProjectAsset.project_id == project_id)
    if kind is not None:
        statement = statement.where(WorkProjectAsset.kind == kind)
    if scope is not None:
        statement = statement.where(WorkProjectAsset.scope == scope)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectAsset.locator.ilike(pattern),
            WorkProjectAsset.name.ilike(pattern),
            WorkProjectAsset.summary.ilike(pattern),
            cast(WorkProjectAsset.kind, String).ilike(pattern),
        ))
    result = await paginate_statement(statement.order_by(WorkProjectAsset.id), page=page, size=size)
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectAssetSchema.model_validate(item) for item in result.items],
    )


async def create_work_project_asset(
    project_id: int,
    request: WorkProjectAssetRequest,
    *,
    origin: WorkProjectAssetOrigin = WorkProjectAssetOrigin.DISCOVERED,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectAssetSchema | None, str]:
    now = datetime.now()
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        existing = await _get_asset_by_identity(session, project_id, request)
        if existing is not None:
            return None, "asset already exists"
        asset = WorkProjectAsset(
            project_id=project_id,
            origin=origin,
            created_by_agent_code=created_by_agent_code.strip(),
            created_from_session_id=created_from_session_id.strip(),
            created_at=now,
            updated_at=now,
        )
        apply_asset_request(asset, request, now)
        session.add(asset)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            return None, "asset already exists"
        await session.refresh(asset)
    return WorkProjectAssetSchema.model_validate(asset), ""


async def update_work_project_asset(
    project_id: int,
    asset_id: int,
    request: WorkProjectAssetRequest,
) -> tuple[WorkProjectAssetSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        asset = (await session.exec(select(WorkProjectAsset).where(WorkProjectAsset.id == asset_id).with_for_update())).one_or_none()
        if asset is None or asset.project_id != project_id:
            return None, "asset not found"
        conflict = await _get_asset_by_identity(session, project_id, request)
        if conflict is not None and conflict.id != asset_id:
            return None, "asset already exists; merge the duplicate assets instead"
        apply_asset_request(asset, request, datetime.now())
        session.add(asset)
        await session.commit()
        await session.refresh(asset)
    return WorkProjectAssetSchema.model_validate(asset), ""


async def upsert_work_project_asset(
    project_id: int,
    request: WorkProjectAssetRequest,
    *,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectAssetSchema | None, str]:
    async with get_async_session() as session:
        existing = await _get_asset_by_identity(session, project_id, request)
        existing_id = existing.id if existing is not None else None
    if existing_id is not None:
        return await update_work_project_asset(project_id, existing_id, request)
    saved, error = await create_work_project_asset(
        project_id,
        request,
        created_by_agent_code=created_by_agent_code,
        created_from_session_id=created_from_session_id,
    )
    if error != "asset already exists":
        return saved, error
    async with get_async_session() as session:
        winner = await _get_asset_by_identity(session, project_id, request)
        winner_id = winner.id if winner is not None else None
    return await update_work_project_asset(project_id, winner_id, request) if winner_id else (None, error)


async def merge_work_project_assets(
    project_id: int,
    source_asset_id: int,
    target_asset_id: int,
) -> tuple[WorkProjectAssetSchema | None, str]:
    if source_asset_id == target_asset_id:
        return None, "source and target assets must be different"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        assets = list((await session.exec(
            select(WorkProjectAsset).where(WorkProjectAsset.id.in_({source_asset_id, target_asset_id})).with_for_update()
        )).all())
        by_id = {asset.id: asset for asset in assets}
        source = by_id.get(source_asset_id)
        target = by_id.get(target_asset_id)
        if source is None or target is None or source.project_id != project_id or target.project_id != project_id:
            return None, "asset not found"
        source_path_ids = set((await session.exec(select(WorkProjectAttackPathStep.path_id).where(
            WorkProjectAttackPathStep.project_id == project_id,
            or_(
                WorkProjectAttackPathStep.source_asset_id == source_asset_id,
                WorkProjectAttackPathStep.target_asset_id == source_asset_id,
            ),
        ))).all())
        target_path_ids = set((await session.exec(select(WorkProjectAttackPathStep.path_id).where(
            WorkProjectAttackPathStep.project_id == project_id,
            or_(
                WorkProjectAttackPathStep.source_asset_id == target_asset_id,
                WorkProjectAttackPathStep.target_asset_id == target_asset_id,
            ),
        ))).all())
        if source_path_ids & target_path_ids:
            return None, "asset merge would collapse distinct nodes in an attack path; revise the path first"

        await session.execute(update(WorkProjectEvidence).where(WorkProjectEvidence.primary_asset_id == source_asset_id).values(primary_asset_id=target_asset_id))
        await session.execute(update(WorkProjectFinding).where(WorkProjectFinding.primary_asset_id == source_asset_id).values(primary_asset_id=target_asset_id))
        await session.execute(update(WorkProjectAttackPath).where(WorkProjectAttackPath.entry_asset_id == source_asset_id).values(entry_asset_id=target_asset_id))
        await session.execute(update(WorkProjectAttackPath).where(WorkProjectAttackPath.target_asset_id == source_asset_id).values(target_asset_id=target_asset_id))
        await session.execute(update(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.source_asset_id == source_asset_id).values(source_asset_id=target_asset_id))
        await session.execute(update(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.target_asset_id == source_asset_id).values(target_asset_id=target_asset_id))

        for link in list((await session.exec(select(WorkProjectFindingAsset).where(WorkProjectFindingAsset.asset_id == source_asset_id))).all()):
            existing = await session.get(WorkProjectFindingAsset, (link.finding_id, target_asset_id, link.role))
            if existing is not None:
                await session.delete(link)
            else:
                link.asset_id = target_asset_id
                session.add(link)
        for item in list((await session.exec(select(WorkProjectWorkItemTarget).where(WorkProjectWorkItemTarget.asset_id == source_asset_id))).all()):
            duplicate = (await session.exec(select(WorkProjectWorkItemTarget).where(
                WorkProjectWorkItemTarget.work_item_id == item.work_item_id,
                WorkProjectWorkItemTarget.asset_id == target_asset_id,
                WorkProjectWorkItemTarget.surface == item.surface,
            ))).first()
            if duplicate is not None:
                await session.delete(item)
            else:
                item.asset_id = target_asset_id
                session.add(item)

        relations = list((await session.exec(select(WorkProjectRelation).where(
            WorkProjectRelation.project_id == project_id,
            or_(WorkProjectRelation.source_asset_id == source_asset_id, WorkProjectRelation.target_asset_id == source_asset_id),
        ))).all())
        for relation in relations:
            new_source = target_asset_id if relation.source_asset_id == source_asset_id else relation.source_asset_id
            new_target = target_asset_id if relation.target_asset_id == source_asset_id else relation.target_asset_id
            if new_source == new_target:
                await session.delete(relation)
                continue
            duplicate = (await session.exec(select(WorkProjectRelation).where(
                WorkProjectRelation.project_id == project_id,
                WorkProjectRelation.source_asset_id == new_source,
                WorkProjectRelation.target_asset_id == new_target,
                WorkProjectRelation.type == relation.type,
                WorkProjectRelation.id != relation.id,
            ))).first()
            if duplicate is not None:
                evidence_ids = list((await session.exec(select(WorkProjectRelationEvidence.evidence_id).where(
                    WorkProjectRelationEvidence.relation_id == relation.id
                ))).all())
                for evidence_id in evidence_ids:
                    if await session.get(WorkProjectRelationEvidence, (duplicate.id, evidence_id)) is None:
                        session.add(WorkProjectRelationEvidence(relation_id=duplicate.id or 0, evidence_id=evidence_id))
                await session.delete(relation)
            else:
                relation.source_asset_id = new_source
                relation.target_asset_id = new_target
                session.add(relation)

        if source.origin == WorkProjectAssetOrigin.DECLARED:
            target.origin = WorkProjectAssetOrigin.DECLARED
        if source.scope == WorkProjectAssetScope.IN_SCOPE:
            target.scope = WorkProjectAssetScope.IN_SCOPE
        target.updated_at = datetime.now()
        session.add(target)
        await session.delete(source)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            return None, "asset merge conflicts with an existing project reference"
        await session.refresh(target)
    return WorkProjectAssetSchema.model_validate(target), ""


def apply_asset_request(asset: WorkProjectAsset, request: WorkProjectAssetRequest, now: datetime) -> None:
    asset.kind = request.kind
    asset.locator = request.locator
    asset.name = request.name
    asset.summary = request.summary
    asset.scope = request.scope
    asset.criticality = request.criticality
    asset.state = request.state
    asset.updated_at = now


async def _get_asset_by_identity(session, project_id: int, request: WorkProjectAssetRequest) -> WorkProjectAsset | None:
    return (await session.exec(select(WorkProjectAsset).where(
        WorkProjectAsset.project_id == project_id,
        WorkProjectAsset.kind == request.kind,
        WorkProjectAsset.locator == request.locator,
    ))).first()
