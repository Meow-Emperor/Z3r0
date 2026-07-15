from datetime import datetime

from sqlalchemy import String, case, cast, delete as sa_delete, or_
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE, WORK_PROJECT_AGENT_CODES
from database import get_async_session
from model.agent.subordinates import AgentSubordinateTask
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import WorkProjectEvidence
from model.work_project.findings import WorkProjectFinding, WorkProjectFindingAsset
from model.work_project.graph import WorkProjectAttackPath, WorkProjectAttackPathStep, WorkProjectRelation
from model.work_project.workflow import (
    WorkProjectWorkItem,
    WorkProjectWorkItemDependency,
    WorkProjectWorkItemTarget,
    WorkProjectWorkLog,
)
from schema.work_project.assets import WorkProjectAssetScope
from schema.agent.subordinates import AgentSubordinateStatus
from schema.work_project.evidence import WorkProjectEvidenceStatus
from schema.work_project.workflow import (
    WorkProjectReviewDecision,
    WorkProjectTargetStatus,
    WorkProjectWorkItemPhase,
    WorkProjectWorkItemPlanRequest,
    WorkProjectWorkItemPriority,
    WorkProjectWorkItemSchema,
    WorkProjectWorkItemStatus,
    WorkProjectWorkItemTargetKey,
    WorkProjectWorkItemTargetSchema,
    WorkProjectWorkItemTargetUpdateRequest,
    WorkProjectWorkLogKind,
    WorkProjectWorkLogRequest,
    WorkProjectWorkLogSchema,
)
from service.common.pagination import Page, paginate_statement
from service.work_project.locking import lock_active_work_project


def work_item_priority_order():
    return case(
        (WorkProjectWorkItem.priority == WorkProjectWorkItemPriority.URGENT, 0),
        (WorkProjectWorkItem.priority == WorkProjectWorkItemPriority.HIGH, 1),
        (WorkProjectWorkItem.priority == WorkProjectWorkItemPriority.NORMAL, 2),
        (WorkProjectWorkItem.priority == WorkProjectWorkItemPriority.LOW, 3),
        else_=4,
    )


def work_item_status_order():
    return case(
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.REVIEW, 0),
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.BLOCKED, 1),
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.ACTIVE, 2),
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.QUEUED, 3),
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.COMPLETED, 4),
        (WorkProjectWorkItem.status == WorkProjectWorkItemStatus.CANCELED, 5),
        else_=6,
    )


async def query_work_project_work_items(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str,
    status: WorkProjectWorkItemStatus | None = None,
    assignee_agent_code: str = "",
) -> Page[WorkProjectWorkItemSchema]:
    statement = select(WorkProjectWorkItem).where(WorkProjectWorkItem.project_id == project_id)
    if status is not None:
        statement = statement.where(WorkProjectWorkItem.status == status)
    if assignee_agent_code := assignee_agent_code.strip():
        statement = statement.where(WorkProjectWorkItem.assignee_agent_code == assignee_agent_code)
    if keyword := keyword.strip():
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            WorkProjectWorkItem.title.ilike(pattern),
            WorkProjectWorkItem.objective.ilike(pattern),
            WorkProjectWorkItem.assignee_agent_code.ilike(pattern),
            cast(WorkProjectWorkItem.status, String).ilike(pattern),
        ))
    result = await paginate_statement(
        statement.order_by(
            work_item_status_order(),
            work_item_priority_order(),
            WorkProjectWorkItem.updated_at.asc(),
            WorkProjectWorkItem.id.asc(),
        ),
        page=page,
        size=size,
    )
    return Page(
        page=result.page,
        size=result.size,
        total=result.total,
        items=[WorkProjectWorkItemSchema.model_validate(item) for item in result.items],
    )


async def create_work_project_work_item(
    project_id: int,
    plan: WorkProjectWorkItemPlanRequest,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    if actor_agent_code != DEFAULT_AGENT_CODE:
        return None, "only cso can create work items"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        if error := await _validate_plan(session, project_id, plan, None):
            return None, error
        now = datetime.now()
        item = WorkProjectWorkItem(
            project_id=project_id,
            status=WorkProjectWorkItemStatus.QUEUED,
            created_by_agent_code=actor_agent_code,
            created_from_session_id=actor_session_id,
            created_at=now,
            updated_at=now,
        )
        _apply_plan(item, plan)
        session.add(item)
        await session.flush()
        item_id = item.id or 0
        session.add_all([
            WorkProjectWorkItemTarget(
                work_item_id=item_id,
                asset_id=target.asset_id,
                surface=target.surface,
                status=WorkProjectTargetStatus.PENDING,
                updated_at=now,
            )
            for target in plan.targets
        ])
        session.add_all([
            WorkProjectWorkItemDependency(work_item_id=item_id, depends_on_id=dependency_id)
            for dependency_id in plan.dependency_ids
        ])
        _add_log(
            session,
            item,
            WorkProjectWorkLogKind.STATE_CHANGE,
            "created -> queued",
            actor_agent_code,
            actor_session_id,
            now,
        )
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def update_work_project_work_item_plan(
    project_id: int,
    work_item_id: int,
    plan: WorkProjectWorkItemPlanRequest,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    if actor_agent_code != DEFAULT_AGENT_CODE:
        return None, "only cso can update work item plans"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if item.status != WorkProjectWorkItemStatus.QUEUED:
            return None, "work item plans are immutable after activation; cancel and replace the work item when the plan changes"
        if error := await _validate_plan(session, project_id, plan, work_item_id):
            return None, error
        changes = await _plan_changes(session, item, plan)
        now = datetime.now()
        _apply_plan(item, plan)
        item.updated_at = now
        session.add(item)
        await session.execute(sa_delete(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id
        ))
        await session.execute(sa_delete(WorkProjectWorkItemDependency).where(
            WorkProjectWorkItemDependency.work_item_id == work_item_id
        ))
        session.add_all([
            WorkProjectWorkItemTarget(
                work_item_id=work_item_id,
                asset_id=target.asset_id,
                surface=target.surface,
                status=WorkProjectTargetStatus.PENDING,
                updated_at=now,
            )
            for target in plan.targets
        ])
        session.add_all([
            WorkProjectWorkItemDependency(work_item_id=work_item_id, depends_on_id=dependency_id)
            for dependency_id in plan.dependency_ids
        ])
        if changes:
            _add_log(
                session,
                item,
                WorkProjectWorkLogKind.PLAN_CHANGE,
                f"Updated planning fields: {', '.join(changes)}",
                actor_agent_code,
                actor_session_id,
                now,
            )
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def activate_work_project_work_item(
    project_id: int,
    work_item_id: int,
    reason: str,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    reason = reason.strip()
    if not reason:
        return None, "activation reason is required"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        previous_status = item.status
        if previous_status == WorkProjectWorkItemStatus.QUEUED:
            if actor_agent_code != DEFAULT_AGENT_CODE:
                return None, "only cso can activate queued work items"
        elif previous_status == WorkProjectWorkItemStatus.BLOCKED:
            if not _can_execute(item, actor_agent_code):
                return None, "work item is assigned to another agent"
        else:
            return None, "only queued or blocked work items can be activated"
        if error := await _validate_activation(session, item):
            return None, error
        now = datetime.now()
        targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id
        ))).all())
        for target in targets:
            if target.status in {WorkProjectTargetStatus.PENDING, WorkProjectTargetStatus.BLOCKED}:
                target.status = WorkProjectTargetStatus.ACTIVE
                target.conclusion = ""
                target.deferral_reason = ""
                target.updated_at = now
                session.add(target)
        item.status = WorkProjectWorkItemStatus.ACTIVE
        item.blocker_reason = ""
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, reason, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def update_work_project_work_item_target(
    project_id: int,
    work_item_id: int,
    update: WorkProjectWorkItemTargetUpdateRequest,
    *,
    actor_agent_code: str,
) -> tuple[WorkProjectWorkItemTargetSchema | None, str]:
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if not _can_execute(item, actor_agent_code):
            return None, "work item is assigned to another agent"
        if item.status != WorkProjectWorkItemStatus.ACTIVE:
            return None, "target coverage can only be updated on an active work item"
        target = (await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id,
            WorkProjectWorkItemTarget.asset_id == update.asset_id,
            WorkProjectWorkItemTarget.surface == update.surface,
        ).with_for_update())).one_or_none()
        if target is None:
            return None, "work item target not found"
        if update.status == WorkProjectTargetStatus.COVERED and not await _has_active_evidence(session, work_item_id):
            return None, "covered target requires active evidence on the work item"
        target.status = update.status
        target.conclusion = update.conclusion
        target.deferral_reason = update.deferral_reason
        target.updated_at = datetime.now()
        item.updated_at = target.updated_at
        session.add(target)
        session.add(item)
        await session.commit()
        await session.refresh(target)
    return WorkProjectWorkItemTargetSchema.model_validate(target), ""


async def block_work_project_work_item(
    project_id: int,
    work_item_id: int,
    targets: list[WorkProjectWorkItemTargetKey],
    reason: str,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    reason = reason.strip()
    if not reason:
        return None, "blocker reason is required"
    if not targets:
        return None, "at least one blocked target is required"
    target_keys = {(target.asset_id, target.surface) for target in targets}
    if len(target_keys) != len(targets):
        return None, "blocked targets contain duplicates"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if not _can_execute(item, actor_agent_code):
            return None, "work item is assigned to another agent"
        if item.status != WorkProjectWorkItemStatus.ACTIVE:
            return None, "only an active work item can be blocked"
        rows = list((await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id
        ).with_for_update())).all())
        by_key = {(target.asset_id, target.surface): target for target in rows}
        if not target_keys.issubset(by_key):
            return None, "blocked target not found on work item"
        now = datetime.now()
        for key in target_keys:
            target = by_key[key]
            target.status = WorkProjectTargetStatus.BLOCKED
            target.conclusion = ""
            target.deferral_reason = ""
            target.updated_at = now
            session.add(target)
        previous_status = item.status
        item.status = WorkProjectWorkItemStatus.BLOCKED
        item.blocker_reason = reason
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, reason, actor_agent_code, actor_session_id, now)
        _add_log(session, item, WorkProjectWorkLogKind.BLOCKER, reason, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def submit_work_project_work_item_review(
    project_id: int,
    work_item_id: int,
    result_summary: str,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    result_summary = result_summary.strip()
    if not result_summary:
        return None, "review submission requires a result summary"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if not _can_execute(item, actor_agent_code):
            return None, "work item is assigned to another agent"
        if item.status != WorkProjectWorkItemStatus.ACTIVE:
            return None, "only an active work item can be submitted for review"
        targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id
        ))).all())
        if any(target.status not in {WorkProjectTargetStatus.COVERED, WorkProjectTargetStatus.DEFERRED} for target in targets):
            return None, "review requires every target to be covered or deferred"
        if not await _has_active_evidence(session, work_item_id):
            return None, "review requires at least one active evidence record"
        now = datetime.now()
        previous_status = item.status
        item.status = WorkProjectWorkItemStatus.REVIEW
        item.result_summary = result_summary
        item.blocker_reason = ""
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, "submitted for lead review", actor_agent_code, actor_session_id, now)
        _add_log(session, item, WorkProjectWorkLogKind.RESULT, result_summary, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def review_work_project_work_item(
    project_id: int,
    work_item_id: int,
    decision: WorkProjectReviewDecision,
    reason: str,
    reopened_targets: list[WorkProjectWorkItemTargetKey],
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    if actor_agent_code != DEFAULT_AGENT_CODE:
        return None, "only cso can review work items"
    reason = reason.strip()
    if not reason:
        return None, "review decision reason is required"
    keys = {(target.asset_id, target.surface) for target in reopened_targets}
    if len(keys) != len(reopened_targets):
        return None, "reopened targets contain duplicates"
    if decision == WorkProjectReviewDecision.ACCEPT and keys:
        return None, "accepted review cannot reopen targets"
    if decision == WorkProjectReviewDecision.REQUEST_CHANGES and not keys:
        return None, "change requests must identify at least one target to reopen"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if item.status != WorkProjectWorkItemStatus.REVIEW:
            return None, "work item is not awaiting review"
        now = datetime.now()
        previous_status = item.status
        if decision == WorkProjectReviewDecision.ACCEPT:
            item.status = WorkProjectWorkItemStatus.COMPLETED
        else:
            targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
                WorkProjectWorkItemTarget.work_item_id == work_item_id
            ).with_for_update())).all())
            by_key = {(target.asset_id, target.surface): target for target in targets}
            if not keys.issubset(by_key):
                return None, "reopened target not found on work item"
            for key in keys:
                target = by_key[key]
                target.status = WorkProjectTargetStatus.ACTIVE
                target.conclusion = ""
                target.deferral_reason = ""
                target.updated_at = now
                session.add(target)
            item.status = WorkProjectWorkItemStatus.ACTIVE
            item.result_summary = ""
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, reason, actor_agent_code, actor_session_id, now)
        _add_log(session, item, WorkProjectWorkLogKind.DECISION, reason, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def cancel_work_project_work_item(
    project_id: int,
    work_item_id: int,
    reason: str,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    if actor_agent_code != DEFAULT_AGENT_CODE:
        return None, "only cso can cancel work items"
    reason = reason.strip()
    if not reason:
        return None, "cancellation reason is required"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if item.status in {WorkProjectWorkItemStatus.COMPLETED, WorkProjectWorkItemStatus.CANCELED}:
            return None, "work item is already terminal"
        running_subagent = (await session.exec(select(AgentSubordinateTask.run_id).where(
            AgentSubordinateTask.work_item_id == work_item_id,
            AgentSubordinateTask.status == AgentSubordinateStatus.RUNNING,
        ).limit(1))).first()
        if running_subagent is not None:
            return None, "cancel the running delegated task before canceling its WorkItem"
        now = datetime.now()
        previous_status = item.status
        item.status = WorkProjectWorkItemStatus.CANCELED
        item.blocker_reason = ""
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, reason, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def reopen_work_project_work_item(
    project_id: int,
    work_item_id: int,
    reason: str,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkItemSchema | None, str]:
    if actor_agent_code != DEFAULT_AGENT_CODE:
        return None, "only cso can reopen work items"
    reason = reason.strip()
    if not reason:
        return None, "reopen reason is required"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await _lock_work_item(session, project_id, work_item_id)
        if item is None:
            return None, "work item not found"
        if item.status not in {WorkProjectWorkItemStatus.COMPLETED, WorkProjectWorkItemStatus.CANCELED}:
            return None, "only terminal work items can be reopened"
        now = datetime.now()
        previous_status = item.status
        targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id == work_item_id
        ).with_for_update())).all())
        for target in targets:
            target.status = WorkProjectTargetStatus.PENDING
            target.conclusion = ""
            target.deferral_reason = ""
            target.updated_at = now
            session.add(target)
        item.status = WorkProjectWorkItemStatus.QUEUED
        item.result_summary = ""
        item.blocker_reason = ""
        item.updated_at = now
        session.add(item)
        _add_state_log(session, item, previous_status, item.status, reason, actor_agent_code, actor_session_id, now)
        await session.commit()
        await session.refresh(item)
    return WorkProjectWorkItemSchema.model_validate(item), ""


async def create_work_project_work_log(
    project_id: int,
    work_item_id: int,
    request: WorkProjectWorkLogRequest,
    *,
    actor_agent_code: str,
    actor_session_id: str,
) -> tuple[WorkProjectWorkLogSchema | None, str]:
    if request.kind in {WorkProjectWorkLogKind.STATE_CHANGE, WorkProjectWorkLogKind.PLAN_CHANGE}:
        return None, "state and plan change logs are generated by the system"
    async with get_async_session() as session:
        if error := await lock_active_work_project(session, project_id):
            return None, error
        item = await session.get(WorkProjectWorkItem, work_item_id)
        if item is None or item.project_id != project_id:
            return None, "work item not found"
        if not _can_execute(item, actor_agent_code):
            return None, "work item is assigned to another agent"
        if actor_agent_code != DEFAULT_AGENT_CODE and item.status not in {
            WorkProjectWorkItemStatus.ACTIVE,
            WorkProjectWorkItemStatus.BLOCKED,
        }:
            return None, "specialist work logs require an active or blocked work item"
        if item.status in {WorkProjectWorkItemStatus.COMPLETED, WorkProjectWorkItemStatus.CANCELED}:
            return None, "terminal work items must be reopened before adding work logs"
        log = WorkProjectWorkLog(
            project_id=project_id,
            work_item_id=work_item_id,
            kind=request.kind,
            content=request.content,
            created_by_agent_code=actor_agent_code,
            created_from_session_id=actor_session_id,
            created_at=datetime.now(),
        )
        session.add(log)
        await session.commit()
        await session.refresh(log)
    return WorkProjectWorkLogSchema.model_validate(log), ""


async def _validate_plan(
    session,
    project_id: int,
    plan: WorkProjectWorkItemPlanRequest,
    work_item_id: int | None,
) -> str:
    if plan.assignee_agent_code not in WORK_PROJECT_AGENT_CODES:
        return "work item assignee is not a registered project agent"
    target_ids = {target.asset_id for target in plan.targets}
    assets = list((await session.exec(select(WorkProjectAsset).where(
        WorkProjectAsset.id.in_(target_ids)
    ))).all())
    if len(assets) != len(target_ids) or any(asset.project_id != project_id for asset in assets):
        return "target asset not found"
    dependency_ids = set(plan.dependency_ids)
    if work_item_id is not None and work_item_id in dependency_ids:
        return "work item cannot depend on itself"
    if dependency_ids:
        dependencies = list((await session.exec(select(WorkProjectWorkItem).where(
            WorkProjectWorkItem.id.in_(dependency_ids)
        ))).all())
        if len(dependencies) != len(dependency_ids) or any(item.project_id != project_id for item in dependencies):
            return "dependency work item not found"
        if work_item_id is not None and await _creates_dependency_cycle(session, work_item_id, dependency_ids):
            return "work item dependencies contain a cycle"
    if plan.parent_id is not None:
        if plan.parent_id == work_item_id:
            return "work item cannot be its own parent"
        parent = await session.get(WorkProjectWorkItem, plan.parent_id)
        if parent is None or parent.project_id != project_id:
            return "parent work item not found"
        if work_item_id is not None and await _creates_parent_cycle(
            session, project_id, work_item_id, plan.parent_id
        ):
            return "work item parent hierarchy contains a cycle"
    focus_models = (
        (plan.focus_relation_id, WorkProjectRelation, "relation"),
        (plan.focus_finding_id, WorkProjectFinding, "finding"),
        (plan.focus_attack_path_id, WorkProjectAttackPath, "attack path"),
        (plan.focus_attack_path_step_id, WorkProjectAttackPathStep, "attack path step"),
    )
    for focus_id, model, label in focus_models:
        if focus_id is None:
            continue
        focus = await session.get(model, focus_id)
        if focus is None or focus.project_id != project_id:
            return f"focus {label} not found"
        if model is WorkProjectRelation and not {
            focus.source_asset_id,
            focus.target_asset_id,
        }.issubset(target_ids):
            return "relation-focused work item must target both relation endpoint assets"
        if model is WorkProjectFinding:
            finding_asset_ids = {focus.primary_asset_id}
            finding_asset_ids.update((await session.exec(select(WorkProjectFindingAsset.asset_id).where(
                WorkProjectFindingAsset.finding_id == focus.id
            ))).all())
            if not (finding_asset_ids & target_ids):
                return "finding-focused work item must target an asset linked to the finding"
        if model is WorkProjectAttackPath:
            path_steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
                WorkProjectAttackPathStep.path_id == focus.id
            ))).all())
            path_asset_ids = {
                asset_id
                for step in path_steps
                for asset_id in (step.source_asset_id, step.target_asset_id)
            }
            if not path_asset_ids.issubset(target_ids):
                return "attack-path-focused work item must target every asset in the path"
        if model is WorkProjectAttackPathStep and not {
            focus.source_asset_id,
            focus.target_asset_id,
        }.issubset(target_ids):
            return "attack-path-step-focused work item must target both step endpoint assets"
    return ""


async def _validate_activation(session, item: WorkProjectWorkItem) -> str:
    if error := await work_item_target_scope_error(session, item):
        return error
    dependency_ids = list((await session.exec(select(WorkProjectWorkItemDependency.depends_on_id).where(
        WorkProjectWorkItemDependency.work_item_id == item.id
    ))).all())
    if dependency_ids:
        dependencies = list((await session.exec(select(WorkProjectWorkItem).where(
            WorkProjectWorkItem.id.in_(dependency_ids)
        ))).all())
        if any(dependency.status != WorkProjectWorkItemStatus.COMPLETED for dependency in dependencies):
            return "work item dependencies are not completed"
    return ""


async def work_item_target_scope_error(session, item: WorkProjectWorkItem) -> str:
    """Validate that a WorkItem still has executable targets in current scope."""
    targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
        WorkProjectWorkItemTarget.work_item_id == item.id
    ))).all())
    if not targets:
        return "work item has no targets"
    asset_ids = {target.asset_id for target in targets}
    assets = list((await session.exec(select(WorkProjectAsset).where(
        WorkProjectAsset.id.in_(asset_ids)
    ))).all())
    if len(assets) != len(asset_ids) or any(asset.project_id != item.project_id for asset in assets):
        return "work item target asset not found"
    if item.phase != WorkProjectWorkItemPhase.SCOPE_REVIEW and any(
        asset.scope != WorkProjectAssetScope.IN_SCOPE for asset in assets
    ):
        return "work item execution is limited to in-scope target assets"
    return ""


async def _lock_work_item(session, project_id: int, work_item_id: int) -> WorkProjectWorkItem | None:
    item = (await session.exec(select(WorkProjectWorkItem).where(
        WorkProjectWorkItem.id == work_item_id
    ).with_for_update())).one_or_none()
    return item if item is not None and item.project_id == project_id else None


async def _has_active_evidence(session, work_item_id: int) -> bool:
    return (await session.exec(select(WorkProjectEvidence.id).where(
        WorkProjectEvidence.work_item_id == work_item_id,
        WorkProjectEvidence.status == WorkProjectEvidenceStatus.ACTIVE,
    ).limit(1))).first() is not None


def _can_execute(item: WorkProjectWorkItem, actor_agent_code: str) -> bool:
    return actor_agent_code == DEFAULT_AGENT_CODE or item.assignee_agent_code == actor_agent_code


def _apply_plan(item: WorkProjectWorkItem, plan: WorkProjectWorkItemPlanRequest) -> None:
    for field_name in (
        "parent_id", "title", "phase", "priority", "assignee_agent_code",
        "objective", "execution_scope", "completion_criteria", "focus_relation_id",
        "focus_finding_id", "focus_attack_path_id", "focus_attack_path_step_id",
    ):
        setattr(item, field_name, getattr(plan, field_name))


async def _plan_changes(
    session,
    item: WorkProjectWorkItem,
    plan: WorkProjectWorkItemPlanRequest,
) -> list[str]:
    fields = (
        "parent_id", "title", "phase", "priority", "assignee_agent_code",
        "objective", "execution_scope", "completion_criteria", "focus_relation_id",
        "focus_finding_id", "focus_attack_path_id", "focus_attack_path_step_id",
    )
    changes = [name for name in fields if getattr(item, name) != getattr(plan, name)]
    dependency_ids = set((await session.exec(select(WorkProjectWorkItemDependency.depends_on_id).where(
        WorkProjectWorkItemDependency.work_item_id == item.id
    ))).all())
    if dependency_ids != set(plan.dependency_ids):
        changes.append("dependencies")
    target_keys = set((await session.exec(select(
        WorkProjectWorkItemTarget.asset_id,
        WorkProjectWorkItemTarget.surface,
    ).where(WorkProjectWorkItemTarget.work_item_id == item.id))).all())
    if target_keys != {(target.asset_id, target.surface) for target in plan.targets}:
        changes.append("targets")
    return changes


def _add_state_log(
    session,
    item: WorkProjectWorkItem,
    previous: WorkProjectWorkItemStatus,
    current: WorkProjectWorkItemStatus,
    reason: str,
    actor_agent_code: str,
    actor_session_id: str,
    now: datetime,
) -> None:
    _add_log(
        session,
        item,
        WorkProjectWorkLogKind.STATE_CHANGE,
        f"{_enum_value(previous)} -> {_enum_value(current)}: {reason}",
        actor_agent_code,
        actor_session_id,
        now,
    )


def _add_log(
    session,
    item: WorkProjectWorkItem,
    kind: WorkProjectWorkLogKind,
    content: str,
    actor_agent_code: str,
    actor_session_id: str,
    now: datetime,
) -> None:
    session.add(WorkProjectWorkLog(
        project_id=item.project_id,
        work_item_id=item.id or 0,
        kind=kind,
        content=content,
        created_by_agent_code=actor_agent_code,
        created_from_session_id=actor_session_id,
        created_at=now,
    ))


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def _creates_dependency_cycle(session, work_item_id: int, dependency_ids: set[int]) -> bool:
    rows = list((await session.exec(select(WorkProjectWorkItemDependency))).all())
    graph: dict[int, set[int]] = {}
    for row in rows:
        if row.work_item_id != work_item_id:
            graph.setdefault(row.work_item_id, set()).add(row.depends_on_id)
    graph[work_item_id] = dependency_ids

    def reaches_start(node: int, seen: set[int]) -> bool:
        if node == work_item_id:
            return True
        if node in seen:
            return False
        seen.add(node)
        return any(reaches_start(next_id, seen) for next_id in graph.get(node, set()))

    return any(reaches_start(dependency_id, set()) for dependency_id in dependency_ids)


async def _creates_parent_cycle(
    session,
    project_id: int,
    work_item_id: int,
    parent_id: int,
) -> bool:
    rows = list((await session.exec(select(WorkProjectWorkItem).where(
        WorkProjectWorkItem.project_id == project_id
    ))).all())
    parents = {item.id: item.parent_id for item in rows if item.id is not None}
    parents[work_item_id] = parent_id
    seen: set[int] = set()
    current: int | None = parent_id
    while current is not None:
        if current == work_item_id or current in seen:
            return True
        seen.add(current)
        current = parents.get(current)
    return False
