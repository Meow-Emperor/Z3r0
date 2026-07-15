from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import String, cast, delete as sa_delete, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import WorkProjectAttackPathStepEvidence, WorkProjectRelationEvidence
from model.work_project.findings import WorkProjectFinding, WorkProjectFindingAsset
from model.work_project.graph import WorkProjectAttackPath, WorkProjectAttackPathStep, WorkProjectRelation
from schema.work_project.graph import (
    WorkProjectAttackPathRequest,
    WorkProjectAttackPathSchema,
    WorkProjectAttackPathStepSchema,
    WorkProjectAttackStepStatus,
    WorkProjectAssertionStatus,
    WorkProjectRelationRequest,
    WorkProjectRelationSchema,
)
from schema.work_project.findings import WorkProjectFindingVerification
from service.common.pagination import Page, paginate_statement
from service.work_project.evidence import validate_active_evidence_ids
from service.work_project.locking import lock_active_work_project


@dataclass(frozen=True, slots=True)
class WorkProjectGraphSnapshot:
    relations: list[WorkProjectRelationSchema]
    attack_paths: list[WorkProjectAttackPathSchema]
    attack_path_steps: list[WorkProjectAttackPathStepSchema]


async def query_work_project_graph(project_id: int) -> WorkProjectGraphSnapshot:
    async with get_async_session() as session:
        relations = list((await session.exec(
            select(WorkProjectRelation).where(WorkProjectRelation.project_id == project_id).order_by(WorkProjectRelation.id)
        )).all())
        paths = list((await session.exec(
            select(WorkProjectAttackPath).where(WorkProjectAttackPath.project_id == project_id).order_by(WorkProjectAttackPath.id)
        )).all())
        steps = list((await session.exec(
            select(WorkProjectAttackPathStep)
            .where(WorkProjectAttackPathStep.project_id == project_id)
            .order_by(WorkProjectAttackPathStep.path_id, WorkProjectAttackPathStep.sequence)
        )).all())
    return WorkProjectGraphSnapshot(
        relations=[WorkProjectRelationSchema.model_validate(item) for item in relations],
        attack_paths=[WorkProjectAttackPathSchema.model_validate(item) for item in paths],
        attack_path_steps=[WorkProjectAttackPathStepSchema.model_validate(item) for item in steps],
    )


async def query_work_project_relations(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    status: WorkProjectAssertionStatus | None = None,
) -> Page[WorkProjectRelationSchema]:
    statement = select(WorkProjectRelation).where(WorkProjectRelation.project_id == project_id)
    if status is not None:
        statement = statement.where(WorkProjectRelation.status == status)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectRelation.summary.ilike(pattern),
            cast(WorkProjectRelation.type, String).ilike(pattern),
            cast(WorkProjectRelation.status, String).ilike(pattern),
        ))
    result = await paginate_statement(statement.order_by(WorkProjectRelation.id), page=page, size=size)
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectRelationSchema.model_validate(item) for item in result.items],
    )


async def query_work_project_attack_paths(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
) -> Page[WorkProjectAttackPathSchema]:
    statement = select(WorkProjectAttackPath).where(WorkProjectAttackPath.project_id == project_id)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectAttackPath.title.ilike(pattern),
            WorkProjectAttackPath.objective.ilike(pattern),
            WorkProjectAttackPath.summary.ilike(pattern),
        ))
    result = await paginate_statement(statement.order_by(WorkProjectAttackPath.id.desc()), page=page, size=size)
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectAttackPathSchema.model_validate(item) for item in result.items],
    )


async def upsert_work_project_relation(
    project_id: int,
    request: WorkProjectRelationRequest,
    *,
    relation_id: int | None = None,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectRelationSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        error = await _validate_relation_request(session, project_id, request)
        if error:
            return None, error
        relation = None
        if relation_id is not None:
            relation = (await session.exec(select(WorkProjectRelation).where(WorkProjectRelation.id == relation_id).with_for_update())).one_or_none()
            if relation is None or relation.project_id != project_id:
                return None, "relation not found"
        else:
            relation = (await session.exec(select(WorkProjectRelation).where(
                WorkProjectRelation.project_id == project_id,
                WorkProjectRelation.source_asset_id == request.source_asset_id,
                WorkProjectRelation.target_asset_id == request.target_asset_id,
                WorkProjectRelation.type == request.type,
            ).with_for_update())).one_or_none()
        actor_code = created_by_agent_code.strip()
        if relation is not None and actor_code != DEFAULT_AGENT_CODE and relation.created_by_agent_code != actor_code:
            return None, "specialist agents can only update relations they created"
        if relation is not None:
            linked_steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
                WorkProjectAttackPathStep.relation_id == relation.id
            ))).all())
            for step in linked_steps:
                if (request.source_asset_id, request.target_asset_id) != (
                    step.source_asset_id,
                    step.target_asset_id,
                ):
                    return None, "relation endpoints must continue to match every attack path step that references it"
                if request.status == WorkProjectAssertionStatus.REFUTED and step.status != WorkProjectAttackStepStatus.REFUTED:
                    return None, "revise non-refuted attack path steps before refuting their linked relation"
                if step.status == WorkProjectAttackStepStatus.VALIDATED and request.status not in {
                    WorkProjectAssertionStatus.OBSERVED,
                    WorkProjectAssertionStatus.VALIDATED,
                }:
                    return None, "validated attack path steps require an observed or validated linked relation"
        now = datetime.now()
        if relation is None:
            relation = WorkProjectRelation(
                project_id=project_id,
                created_by_agent_code=actor_code,
                created_from_session_id=created_from_session_id.strip(),
                created_at=now,
            )
        relation.source_asset_id = request.source_asset_id
        relation.target_asset_id = request.target_asset_id
        relation.type = request.type
        relation.status = request.status
        relation.summary = request.summary
        relation.updated_at = now
        session.add(relation)
        try:
            await session.flush()
        except IntegrityError:
            await session.rollback()
            return None, "relation already exists"
        relation_id_value = relation.id or 0
        await session.execute(sa_delete(WorkProjectRelationEvidence).where(WorkProjectRelationEvidence.relation_id == relation_id_value))
        session.add_all([
            WorkProjectRelationEvidence(relation_id=relation_id_value, evidence_id=evidence_id)
            for evidence_id in request.evidence_ids
        ])
        await session.commit()
        await session.refresh(relation)
    return WorkProjectRelationSchema.model_validate(relation), ""


async def save_work_project_attack_path(
    project_id: int,
    request: WorkProjectAttackPathRequest,
    *,
    path_id: int | None = None,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectAttackPathSchema | None, list[WorkProjectAttackPathStepSchema], str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, [], error
        error = await _validate_path_request(session, project_id, request)
        if error:
            return None, [], error
        path = None
        if path_id is not None:
            path = (await session.exec(select(WorkProjectAttackPath).where(WorkProjectAttackPath.id == path_id).with_for_update())).one_or_none()
            if path is None or path.project_id != project_id:
                return None, [], "attack path not found"
            actor_code = created_by_agent_code.strip()
            if actor_code != DEFAULT_AGENT_CODE and path.created_by_agent_code != actor_code:
                return None, [], "specialist agents can only update attack paths they created"
        now = datetime.now()
        if path is None:
            path = WorkProjectAttackPath(
                project_id=project_id,
                created_by_agent_code=created_by_agent_code.strip(),
                created_from_session_id=created_from_session_id.strip(),
                created_at=now,
            )
        path.title = request.title
        path.objective = request.objective
        path.entry_asset_id = request.entry_asset_id
        path.target_asset_id = request.target_asset_id
        path.summary = request.summary
        path.archived_at = now if request.archived else None
        path.archive_reason = request.archive_reason if request.archived else ""
        path.updated_at = now
        session.add(path)
        await session.flush()
        path_id_value = path.id or 0
        existing_steps = list((await session.exec(
            select(WorkProjectAttackPathStep)
            .where(WorkProjectAttackPathStep.path_id == path_id_value)
            .with_for_update()
        )).all())
        existing_by_sequence = {step.sequence: step for step in existing_steps}
        requested_sequences = {item.sequence for item in request.steps}
        for step in existing_steps:
            if step.sequence not in requested_sequences:
                await session.delete(step)
        saved_steps: list[WorkProjectAttackPathStep] = []
        for item in request.steps:
            step = existing_by_sequence.get(item.sequence)
            if step is None:
                step = WorkProjectAttackPathStep(
                    project_id=project_id,
                    path_id=path_id_value,
                    sequence=item.sequence,
                    created_by_agent_code=created_by_agent_code.strip(),
                    created_from_session_id=created_from_session_id.strip(),
                    created_at=now,
                )
            for field_name in (
                "source_asset_id", "target_asset_id", "action", "description", "preconditions",
                "result", "status", "relation_id", "finding_id", "attack_technique_id", "blocker_reason",
            ):
                setattr(step, field_name, getattr(item, field_name))
            step.updated_at = now
            session.add(step)
            await session.flush()
            await session.execute(sa_delete(WorkProjectAttackPathStepEvidence).where(
                WorkProjectAttackPathStepEvidence.step_id == step.id
            ))
            session.add_all([
                WorkProjectAttackPathStepEvidence(step_id=step.id or 0, evidence_id=evidence_id)
                for evidence_id in item.evidence_ids
            ])
            saved_steps.append(step)
        await session.commit()
        await session.refresh(path)
        for step in saved_steps:
            await session.refresh(step)
    return (
        WorkProjectAttackPathSchema.model_validate(path),
        [WorkProjectAttackPathStepSchema.model_validate(step) for step in saved_steps],
        "",
    )


async def _validate_relation_request(session, project_id: int, request: WorkProjectRelationRequest) -> str:
    if error := await _validate_assets(session, project_id, [request.source_asset_id, request.target_asset_id]):
        return error
    _, error = await validate_active_evidence_ids(session, project_id, request.evidence_ids)
    return error


async def _validate_path_request(session, project_id: int, request: WorkProjectAttackPathRequest) -> str:
    asset_ids = {request.entry_asset_id, request.target_asset_id}
    for step in request.steps:
        asset_ids.update((step.source_asset_id, step.target_asset_id))
    if error := await _validate_assets(session, project_id, list(asset_ids)):
        return error
    for step in request.steps:
        if step.relation_id is not None:
            relation = await session.get(WorkProjectRelation, step.relation_id)
            if relation is None or relation.project_id != project_id:
                return "relation not found"
            if (relation.source_asset_id, relation.target_asset_id) != (step.source_asset_id, step.target_asset_id):
                return "attack path step relation endpoints do not match the step"
            if relation.status == WorkProjectAssertionStatus.REFUTED and step.status != WorkProjectAttackStepStatus.REFUTED:
                return "non-refuted attack path step cannot reference a refuted relation"
            if step.status == WorkProjectAttackStepStatus.VALIDATED and relation.status not in {
                WorkProjectAssertionStatus.OBSERVED,
                WorkProjectAssertionStatus.VALIDATED,
            }:
                return "validated attack path step requires an observed or validated linked relation"
        if step.finding_id is not None:
            finding = await session.get(WorkProjectFinding, step.finding_id)
            if finding is None or finding.project_id != project_id:
                return "finding not found"
            linked_assets = set((await session.exec(select(WorkProjectFindingAsset.asset_id).where(
                WorkProjectFindingAsset.finding_id == step.finding_id
            ))).all())
            if not ({finding.primary_asset_id, *linked_assets} & {step.source_asset_id, step.target_asset_id}):
                return "attack path step finding is not linked to either step endpoint"
            if finding.verification == WorkProjectFindingVerification.REFUTED and step.status != WorkProjectAttackStepStatus.REFUTED:
                return "non-refuted attack path step cannot reference a refuted finding"
            if step.status == WorkProjectAttackStepStatus.VALIDATED and finding.verification != WorkProjectFindingVerification.VALIDATED:
                return "validated attack path step requires a validated linked finding"
        _, error = await validate_active_evidence_ids(session, project_id, step.evidence_ids)
        if error:
            return error
    return ""


async def _validate_assets(session, project_id: int, asset_ids: list[int]) -> str:
    assets = list((await session.exec(select(WorkProjectAsset).where(WorkProjectAsset.id.in_(set(asset_ids))))).all())
    if len(assets) != len(set(asset_ids)) or any(asset.project_id != project_id for asset in assets):
        return "asset not found"
    return ""
