from datetime import datetime

from sqlalchemy import String, cast, delete as sa_delete, or_
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import WorkProjectFindingEvidence
from model.work_project.findings import WorkProjectFinding, WorkProjectFindingAsset
from model.work_project.graph import WorkProjectAttackPathStep
from schema.work_project.findings import (
    WorkProjectFindingRequest,
    WorkProjectFindingSchema,
    WorkProjectFindingSeverity,
    WorkProjectFindingVerification,
)
from schema.work_project.graph import WorkProjectAttackStepStatus
from service.common.pagination import Page, paginate_statement
from service.work_project.evidence import validate_active_evidence_ids
from service.work_project.locking import lock_active_work_project


def finding_affects_assets(asset_ids: set[int]):
    """Build a Finding filter covering both its primary and affected Assets."""
    affected_asset = select(WorkProjectFindingAsset.finding_id).where(
        WorkProjectFindingAsset.finding_id == WorkProjectFinding.id,
        WorkProjectFindingAsset.asset_id.in_(asset_ids),
    ).exists()
    return or_(WorkProjectFinding.primary_asset_id.in_(asset_ids), affected_asset)


async def query_work_project_findings(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    verification: WorkProjectFindingVerification | None = None,
    severity: WorkProjectFindingSeverity | None = None,
) -> Page[WorkProjectFindingSchema]:
    statement = select(WorkProjectFinding).where(WorkProjectFinding.project_id == project_id)
    if verification is not None:
        statement = statement.where(WorkProjectFinding.verification == verification)
    if severity is not None:
        statement = statement.where(WorkProjectFinding.severity == severity)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectFinding.title.ilike(pattern),
            WorkProjectFinding.description.ilike(pattern),
            WorkProjectFinding.impact.ilike(pattern),
            WorkProjectFinding.cwe_id.ilike(pattern),
            cast(WorkProjectFinding.verification, String).ilike(pattern),
            cast(WorkProjectFinding.severity, String).ilike(pattern),
        ))
    result = await paginate_statement(statement.order_by(WorkProjectFinding.id.desc()), page=page, size=size)
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectFindingSchema.model_validate(item) for item in result.items],
    )


async def save_work_project_finding(
    project_id: int,
    request: WorkProjectFindingRequest,
    *,
    finding_id: int | None = None,
    created_by_agent_code: str = "",
    created_from_session_id: str = "",
) -> tuple[WorkProjectFindingSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        asset_ids = {request.primary_asset_id, *(item.asset_id for item in request.affected_assets)}
        assets = list((await session.exec(select(WorkProjectAsset).where(WorkProjectAsset.id.in_(asset_ids)))).all())
        if len(assets) != len(asset_ids) or any(asset.project_id != project_id for asset in assets):
            return None, "asset not found"
        _, error = await validate_active_evidence_ids(session, project_id, request.evidence_ids)
        if error:
            return None, error
        finding = None
        if finding_id is not None:
            finding = (await session.exec(select(WorkProjectFinding).where(WorkProjectFinding.id == finding_id).with_for_update())).one_or_none()
            if finding is None or finding.project_id != project_id:
                return None, "finding not found"
            actor_code = created_by_agent_code.strip()
            if actor_code != DEFAULT_AGENT_CODE and finding.created_by_agent_code != actor_code:
                return None, "specialist agents can only update findings they created"
            linked_steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
                WorkProjectAttackPathStep.finding_id == finding_id
            ))).all())
            request_asset_ids = {request.primary_asset_id, *(item.asset_id for item in request.affected_assets)}
            for step in linked_steps:
                if not (request_asset_ids & {step.source_asset_id, step.target_asset_id}):
                    return None, "finding assets must remain linked to every attack path step that references it"
                if request.verification == WorkProjectFindingVerification.REFUTED and step.status != WorkProjectAttackStepStatus.REFUTED:
                    return None, "revise non-refuted attack path steps before refuting their linked finding"
                if step.status == WorkProjectAttackStepStatus.VALIDATED and request.verification != WorkProjectFindingVerification.VALIDATED:
                    return None, "validated attack path steps require their linked finding to remain validated"
        now = datetime.now()
        previous_verification = finding.verification if finding is not None else None
        if finding is None:
            finding = WorkProjectFinding(
                project_id=project_id,
                created_by_agent_code=created_by_agent_code.strip(),
                created_from_session_id=created_from_session_id.strip(),
                created_at=now,
            )
        finding.primary_asset_id = request.primary_asset_id
        finding.category = request.category
        finding.title = request.title
        finding.verification = request.verification
        finding.resolution = request.resolution
        finding.severity = request.severity
        finding.description = request.description
        finding.preconditions = request.preconditions
        finding.impact = request.impact
        finding.recommendation = request.recommendation
        finding.cwe_id = request.cwe_id
        finding.cvss_vector = request.cvss_vector
        finding.cvss_score = request.cvss_score
        finding.deferral_reason = request.deferral_reason
        finding.updated_at = now
        if request.verification == WorkProjectFindingVerification.VALIDATED and previous_verification != request.verification:
            finding.validated_at = now
        elif request.verification != WorkProjectFindingVerification.VALIDATED:
            finding.validated_at = None
        session.add(finding)
        await session.flush()
        finding_id_value = finding.id or 0
        await session.execute(sa_delete(WorkProjectFindingAsset).where(WorkProjectFindingAsset.finding_id == finding_id_value))
        await session.execute(sa_delete(WorkProjectFindingEvidence).where(WorkProjectFindingEvidence.finding_id == finding_id_value))
        session.add_all([
            WorkProjectFindingAsset(finding_id=finding_id_value, asset_id=item.asset_id, role=item.role)
            for item in request.affected_assets
        ])
        session.add_all([
            WorkProjectFindingEvidence(finding_id=finding_id_value, evidence_id=evidence_id)
            for evidence_id in request.evidence_ids
        ])
        await session.commit()
        await session.refresh(finding)
    return WorkProjectFindingSchema.model_validate(finding), ""
