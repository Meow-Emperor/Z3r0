from datetime import datetime

from sqlalchemy import String, cast, or_, update as sa_update
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import (
    WorkProjectAttackPathStepEvidence,
    WorkProjectEvidence,
    WorkProjectFindingEvidence,
    WorkProjectRelationEvidence,
)
from model.work_project.findings import WorkProjectFinding
from model.work_project.graph import WorkProjectAttackPathStep, WorkProjectRelation
from model.work_project.workflow import WorkProjectWorkItem
from schema.work_project.evidence import (
    WorkProjectEvidenceRequest,
    WorkProjectEvidenceKind,
    WorkProjectEvidenceSchema,
    WorkProjectEvidenceStatus,
)
from schema.work_project.findings import WorkProjectFindingVerification
from schema.work_project.graph import WorkProjectAssertionStatus, WorkProjectAttackStepStatus
from schema.work_project.workflow import WorkProjectWorkItemStatus
from service.common.pagination import Page, paginate_statement
from service.work_project.locking import lock_active_work_project


async def query_work_project_evidence(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    kind: WorkProjectEvidenceKind | None = None,
    status: WorkProjectEvidenceStatus | None = None,
) -> Page[WorkProjectEvidenceSchema]:
    statement = select(WorkProjectEvidence).where(WorkProjectEvidence.project_id == project_id)
    if kind is not None:
        statement = statement.where(WorkProjectEvidence.kind == kind)
    if status is not None:
        statement = statement.where(WorkProjectEvidence.status == status)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectEvidence.title.ilike(pattern),
            WorkProjectEvidence.summary.ilike(pattern),
            WorkProjectEvidence.reference.ilike(pattern),
            cast(WorkProjectEvidence.kind, String).ilike(pattern),
        ))
    result = await paginate_statement(statement.order_by(WorkProjectEvidence.id.desc()), page=page, size=size)
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectEvidenceSchema.model_validate(item) for item in result.items],
    )


async def create_work_project_evidence(
    project_id: int,
    request: WorkProjectEvidenceRequest,
    *,
    created_by_agent_code: str,
    created_from_session_id: str,
) -> tuple[WorkProjectEvidenceSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        if request.primary_asset_id is not None:
            asset = await session.get(WorkProjectAsset, request.primary_asset_id)
            if asset is None or asset.project_id != project_id:
                return None, "primary asset not found"
        work_item = await session.get(WorkProjectWorkItem, request.work_item_id)
        if work_item is None or work_item.project_id != project_id:
            return None, "work item not found"
        actor_code = created_by_agent_code.strip()
        if actor_code != DEFAULT_AGENT_CODE and work_item.assignee_agent_code != actor_code:
            return None, "evidence work item is assigned to another agent"
        if actor_code != DEFAULT_AGENT_CODE and work_item.status not in {
            WorkProjectWorkItemStatus.ACTIVE,
            WorkProjectWorkItemStatus.BLOCKED,
        }:
            return None, "specialist evidence requires an active or blocked work item"
        if work_item.status in {WorkProjectWorkItemStatus.COMPLETED, WorkProjectWorkItemStatus.CANCELED}:
            return None, "evidence cannot be added to a terminal work item; reopen it first"
        superseded = None
        if request.supersedes_evidence_id is not None:
            superseded = await session.get(WorkProjectEvidence, request.supersedes_evidence_id)
            if superseded is None or superseded.project_id != project_id:
                return None, "superseded evidence not found"
            if superseded.status != WorkProjectEvidenceStatus.ACTIVE:
                return None, "only active evidence can be superseded"
            if actor_code != DEFAULT_AGENT_CODE and superseded.created_by_agent_code != actor_code:
                return None, "specialist agents can only supersede evidence they created"
            if superseded.work_item_id != request.work_item_id:
                return None, "replacement evidence must remain attached to the superseded evidence work item"
        evidence = WorkProjectEvidence(
            project_id=project_id,
            kind=request.kind,
            title=request.title,
            summary=request.summary,
            reference=request.reference,
            sha256=request.sha256,
            primary_asset_id=request.primary_asset_id,
            work_item_id=request.work_item_id,
            status=WorkProjectEvidenceStatus.ACTIVE,
            supersedes_evidence_id=request.supersedes_evidence_id,
            captured_at=request.captured_at,
            created_by_agent_code=actor_code,
            created_from_session_id=created_from_session_id.strip(),
            created_at=datetime.now(),
        )
        session.add(evidence)
        await session.flush()
        if superseded is not None:
            superseded.status = WorkProjectEvidenceStatus.SUPERSEDED
            session.add(superseded)
            replacement_id = evidence.id or 0
            for link_model in (
                WorkProjectRelationEvidence,
                WorkProjectFindingEvidence,
                WorkProjectAttackPathStepEvidence,
            ):
                await session.execute(
                    sa_update(link_model)
                    .where(link_model.evidence_id == superseded.id)
                    .values(evidence_id=replacement_id)
                )
        await session.commit()
        await session.refresh(evidence)
    return WorkProjectEvidenceSchema.model_validate(evidence), ""


async def invalidate_work_project_evidence(
    project_id: int,
    evidence_id: int,
    reason: str,
    *,
    actor_agent_code: str,
    actor_work_item_id: int | None = None,
) -> str:
    reason = reason.strip()
    if not reason:
        return "evidence invalidation reason is required"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return error
        evidence = (await session.exec(select(WorkProjectEvidence).where(WorkProjectEvidence.id == evidence_id).with_for_update())).one_or_none()
        if evidence is None or evidence.project_id != project_id:
            return "evidence not found"
        if evidence.status != WorkProjectEvidenceStatus.ACTIVE:
            return "only active evidence can be invalidated"
        actor_code = actor_agent_code.strip()
        if actor_code != DEFAULT_AGENT_CODE and evidence.created_by_agent_code != actor_code:
            return "specialist agents can only invalidate evidence they created"
        if actor_code != DEFAULT_AGENT_CODE and evidence.work_item_id != actor_work_item_id:
            return "specialist agents can only invalidate evidence from their runtime-bound work item"
        if error := await _validate_invalidation_support(session, evidence):
            return error
        evidence.status = WorkProjectEvidenceStatus.INVALIDATED
        evidence.invalidation_reason = reason
        session.add(evidence)
        await session.commit()
    return ""


async def _validate_invalidation_support(session, evidence: WorkProjectEvidence) -> str:
    work_item = await session.get(WorkProjectWorkItem, evidence.work_item_id)
    if work_item is not None and work_item.status in {
        WorkProjectWorkItemStatus.REVIEW,
        WorkProjectWorkItemStatus.COMPLETED,
    }:
        other_evidence = (await session.exec(select(WorkProjectEvidence.id).where(
            WorkProjectEvidence.work_item_id == evidence.work_item_id,
            WorkProjectEvidence.id != evidence.id,
            WorkProjectEvidence.status == WorkProjectEvidenceStatus.ACTIVE,
        ).limit(1))).first()
        if other_evidence is None:
            return f"work item {work_item.id} requires another active evidence record before invalidation"

    relation_ids = list((await session.exec(
        select(WorkProjectRelationEvidence.relation_id).where(
            WorkProjectRelationEvidence.evidence_id == evidence.id
        )
    )).all())
    if relation_ids:
        relations = list((await session.exec(select(WorkProjectRelation).where(
            WorkProjectRelation.id.in_(relation_ids),
            WorkProjectRelation.status.in_({
                WorkProjectAssertionStatus.OBSERVED,
                WorkProjectAssertionStatus.VALIDATED,
                WorkProjectAssertionStatus.REFUTED,
            }),
        ))).all())
        for relation in relations:
            if not await _has_other_active_evidence(
                session,
                WorkProjectRelationEvidence,
                WorkProjectRelationEvidence.relation_id,
                relation.id or 0,
                evidence.id or 0,
            ):
                return f"relation {relation.id} requires another active evidence record before invalidation"

    finding_ids = list((await session.exec(
        select(WorkProjectFindingEvidence.finding_id).where(
            WorkProjectFindingEvidence.evidence_id == evidence.id
        )
    )).all())
    if finding_ids:
        findings = list((await session.exec(select(WorkProjectFinding).where(
            WorkProjectFinding.id.in_(finding_ids),
            WorkProjectFinding.verification.in_({
                WorkProjectFindingVerification.SUSPECTED,
                WorkProjectFindingVerification.VALIDATED,
                WorkProjectFindingVerification.REFUTED,
            }),
        ))).all())
        for finding in findings:
            if not await _has_other_active_evidence(
                session,
                WorkProjectFindingEvidence,
                WorkProjectFindingEvidence.finding_id,
                finding.id or 0,
                evidence.id or 0,
            ):
                return f"finding {finding.id} requires another active evidence record before invalidation"

    step_ids = list((await session.exec(
        select(WorkProjectAttackPathStepEvidence.step_id).where(
            WorkProjectAttackPathStepEvidence.evidence_id == evidence.id
        )
    )).all())
    if step_ids:
        steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
            WorkProjectAttackPathStep.id.in_(step_ids),
            WorkProjectAttackPathStep.status.in_({
                WorkProjectAttackStepStatus.VALIDATED,
                WorkProjectAttackStepStatus.REFUTED,
            }),
        ))).all())
        for step in steps:
            if not await _has_other_active_evidence(
                session,
                WorkProjectAttackPathStepEvidence,
                WorkProjectAttackPathStepEvidence.step_id,
                step.id or 0,
                evidence.id or 0,
            ):
                return f"attack path step {step.id} requires another active evidence record before invalidation"
    return ""


async def _has_other_active_evidence(
    session,
    link_model,
    owner_column,
    owner_id: int,
    excluded_evidence_id: int,
) -> bool:
    evidence_id = (await session.exec(
        select(link_model.evidence_id)
        .join(WorkProjectEvidence, WorkProjectEvidence.id == link_model.evidence_id)
        .where(
            owner_column == owner_id,
            link_model.evidence_id != excluded_evidence_id,
            WorkProjectEvidence.status == WorkProjectEvidenceStatus.ACTIVE,
        )
        .limit(1)
    )).first()
    return evidence_id is not None


async def validate_active_evidence_ids(session, project_id: int, evidence_ids: list[int]) -> tuple[list[WorkProjectEvidence], str]:
    if not evidence_ids:
        return [], ""
    items = list((await session.exec(select(WorkProjectEvidence).where(WorkProjectEvidence.id.in_(evidence_ids)))).all())
    if len(items) != len(set(evidence_ids)) or any(
        item.project_id != project_id or item.status != WorkProjectEvidenceStatus.ACTIVE for item in items
    ):
        return [], "active evidence not found"
    return items, ""
