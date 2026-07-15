import json

from agents import RunContextWrapper, function_tool
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from core.runtime.context import AgentRuntimeContext
from core.work_project_context import build_work_project_context
from database import get_async_session
from model.work_project.assets import WorkProjectAsset
from model.work_project.graph import WorkProjectAttackPathStep
from model.work_project.workflow import WorkProjectWorkItem
from schema.common.tool_results import ToolResultSchema, ToolResultStatusSchema, ToolResultTypeSchema
from schema.work_project.assets import WorkProjectAssetRequest, WorkProjectAssetScope
from schema.work_project.evidence import WorkProjectEvidenceRequest
from schema.work_project.findings import WorkProjectFindingRequest
from schema.work_project.graph import (
    WorkProjectAssertionStatus,
    WorkProjectAttackPathRequest,
    WorkProjectRelationRequest,
    derive_attack_path_status,
)
from schema.work_project.workflow import (
    WorkProjectReviewDecision,
    WorkProjectWorkItemPlanRequest,
    WorkProjectWorkItemStatus,
    WorkProjectWorkItemTargetKey,
    WorkProjectWorkItemTargetUpdateRequest,
    WorkProjectWorkLogRequest,
)
from service.work_project.assets import merge_work_project_assets, query_work_project_assets, update_work_project_asset, upsert_work_project_asset
from service.work_project.evidence import create_work_project_evidence, invalidate_work_project_evidence, query_work_project_evidence
from service.work_project.findings import query_work_project_findings, save_work_project_finding as save_work_project_finding_service
from service.work_project.graph import (
    query_work_project_attack_paths,
    query_work_project_relations,
    save_work_project_attack_path as save_work_project_attack_path_service,
    upsert_work_project_relation,
)
from service.work_project.work_item_records import get_work_project_work_item_record, query_work_project_work_item_records
from service.work_project.workflow import (
    activate_work_project_work_item as activate_work_project_work_item_service,
    block_work_project_work_item as block_work_project_work_item_service,
    cancel_work_project_work_item as cancel_work_project_work_item_service,
    create_work_project_work_item as create_work_project_work_item_service,
    create_work_project_work_log,
    reopen_work_project_work_item as reopen_work_project_work_item_service,
    review_work_project_work_item as review_work_project_work_item_service,
    submit_work_project_work_item_review as submit_work_project_work_item_review_service,
    update_work_project_work_item_plan as update_work_project_work_item_plan_service,
    update_work_project_work_item_target as update_work_project_work_item_target_service,
)


_PAGE_SIZE = 20
_WORK_ITEM_PAGE_SIZE = 10


def work_project_success(payload: object) -> str:
    return ToolResultSchema(
        status=ToolResultStatusSchema.SUCCESS,
        type=ToolResultTypeSchema.WORK_PROJECT,
        output=json.dumps(payload, ensure_ascii=False, default=str),
    ).model_dump_json()


def work_project_error(message: str) -> str:
    return ToolResultSchema(
        status=ToolResultStatusSchema.ERROR,
        type=ToolResultTypeSchema.WORK_PROJECT,
        output=message,
    ).model_dump_json()


@function_tool
async def load_work_project_context(ctx: RunContextWrapper[AgentRuntimeContext]) -> str:
    """Load the current graph-driven WorkProject context.

    A fresh snapshot is injected automatically at turn start. Call this explicit
    refresh after material writes when another same-turn decision depends on them.

    Returns:
        JSON tool result containing the exact runtime-bound or cso-focused WorkItem,
        complete bounded queue metadata, relevant graph and Evidence, and retest candidates.
    """
    return work_project_success(await build_work_project_context(ctx.context))


@function_tool
async def list_work_project_work_items(
    ctx: RunContextWrapper[AgentRuntimeContext],
    keyword: str = "",
    status: WorkProjectWorkItemStatus | None = None,
    assignee_agent_code: str = "",
    page: int = 1,
) -> str:
    """List complete WorkItem records with targets, dependencies, Evidence, logs, and delegated runs.

    Specialists can list only WorkItems assigned to their Agent code. cso can filter
    the complete project queue, including queued and terminal WorkItems.

    Args:
        keyword: Optional title, objective, assignee, or status search text.
        status: Optional exact WorkItem status filter.
        assignee_agent_code: Optional assignee filter; cso only.
        page: One-based result page; each page contains at most 10 complete records.

    Returns:
        JSON tool result with pagination metadata and complete WorkItem records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    assignee = assignee_agent_code.strip()
    if ctx.context.agent_code != DEFAULT_AGENT_CODE:
        if assignee and assignee != ctx.context.agent_code:
            return work_project_error("Specialists can list only their assigned WorkItems.")
        assignee = ctx.context.agent_code
    result = await query_work_project_work_item_records(
        project_id,
        page=max(page, 1),
        size=_WORK_ITEM_PAGE_SIZE,
        keyword=keyword,
        status=status,
        assignee_agent_code=assignee,
    )
    return work_project_success({
        "page": result.page,
        "size": result.size,
        "total": result.total,
        "work_items": [item.model_dump(mode="json") for item in result.items],
    })


@function_tool
async def get_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
) -> str:
    """Load one complete WorkItem record by its durable id.

    Specialists may load only their runtime-bound WorkItem. cso may load any
    WorkItem for planning, review, cancellation, reopening, or closure decisions.

    Args:
        work_item_id: Durable WorkItem id to retrieve.

    Returns:
        JSON tool result with the complete WorkItem, targets, assets, dependencies,
        Evidence, WorkLogs, and subordinate run ids.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if ctx.context.agent_code != DEFAULT_AGENT_CODE and work_item_id != ctx.context.work_item_id:
        return work_project_error("Specialists can load only their runtime-bound WorkItem.")
    record = await get_work_project_work_item_record(project_id, work_item_id)
    if record is None:
        return work_project_error("WorkItem not found.")
    if (
        ctx.context.agent_code != DEFAULT_AGENT_CODE
        and record.work_item.assignee_agent_code != ctx.context.agent_code
    ):
        return work_project_error("WorkItem is assigned to another Agent.")
    return work_project_success({"work_item": record.model_dump(mode="json")})


@function_tool
async def list_work_project_assets(ctx: RunContextWrapper[AgentRuntimeContext], keyword: str = "", page: int = 1) -> str:
    """List canonical Asset nodes in the current WorkProject.

    Scope is authoritative; never execute against context or out-of-scope assets.

    Args:
        keyword: Optional locator, name, summary, or kind search text.
        page: One-based result page; values below one are normalized to one.

    Returns:
        JSON tool result with pagination metadata and compact Asset records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    result = await query_work_project_assets(project_id, page=max(page, 1), size=_PAGE_SIZE, keyword=keyword)
    return work_project_success({"page": result.page, "size": result.size, "total": result.total, "assets": [_compact_asset(item) for item in result.items]})


@function_tool
async def save_work_project_asset(ctx: RunContextWrapper[AgentRuntimeContext], asset_id: int | None, asset: WorkProjectAssetRequest) -> str:
    """Create or update a canonical Asset graph node.

    Specialists create discoveries as context assets and may enrich descriptive
    state. Only cso may change canonical identity, scope, or criticality.

    Args:
        asset_id: Existing Asset id to update, or null to upsert by kind and locator.
        asset: Canonical locator, graph classification, scope, criticality, state,
            name, and concise summary.

    Returns:
        JSON tool result containing the saved Asset, or a validation/permission error.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx):
        return work_project_error(error)
    if ctx.context.agent_code != DEFAULT_AGENT_CODE:
        if asset_id is None and asset.scope != WorkProjectAssetScope.CONTEXT:
            return work_project_error("Specialist agents must record discovered assets with context scope; cso confirms scope.")
        implicit_match = asset_id is None
        current_asset = None
        if implicit_match:
            async with get_async_session() as session:
                current_asset = (await session.exec(select(WorkProjectAsset).where(
                    WorkProjectAsset.project_id == project_id,
                    WorkProjectAsset.kind == asset.kind,
                    WorkProjectAsset.locator == asset.locator,
                ))).first()
            if current_asset is not None:
                asset_id = current_asset.id
        if asset_id is not None:
            if current_asset is None:
                async with get_async_session() as session:
                    current_asset = await session.get(WorkProjectAsset, asset_id)
            if current_asset is None or current_asset.project_id != project_id:
                return work_project_error("Asset not found.")
            governed_fields = ("kind", "locator", "scope", "criticality")
            changed_fields = [
                field_name for field_name in governed_fields
                if getattr(current_asset, field_name) != getattr(asset, field_name)
            ]
            if changed_fields and not implicit_match:
                return work_project_error(
                    f"Only cso can change governed asset fields: {', '.join(changed_fields)}."
                )
            if implicit_match:
                asset = asset.model_copy(update={
                    field_name: getattr(current_asset, field_name)
                    for field_name in governed_fields
                })
    if asset_id is None:
        saved, error = await upsert_work_project_asset(
            project_id, asset,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_asset(project_id, asset_id, asset)
    return work_project_error(error) if error else work_project_success({"asset": _dump(saved)})


@function_tool
async def merge_work_project_asset_records(
    ctx: RunContextWrapper[AgentRuntimeContext],
    source_asset_id: int,
    target_asset_id: int,
) -> str:
    """Merge a duplicate Asset into a canonical Asset and rewire references.

    This operation is restricted to cso and refuses merges that would collapse
    distinct nodes in an AttackPath.

    Args:
        source_asset_id: Duplicate Asset id that will be removed.
        target_asset_id: Canonical Asset id that will remain.

    Returns:
        JSON tool result containing the canonical Asset and merged source id.
    """
    if ctx.context.agent_code != DEFAULT_AGENT_CODE:
        return work_project_error("Only cso can merge assets.")
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await merge_work_project_assets(project_id, source_asset_id, target_asset_id)
    return work_project_error(error) if error else work_project_success({"asset": _dump(saved), "merged_asset_id": source_asset_id})


@function_tool
async def record_work_project_evidence(ctx: RunContextWrapper[AgentRuntimeContext], evidence: WorkProjectEvidenceRequest) -> str:
    """Record immutable Evidence produced by an assigned WorkItem.

    Record Evidence before asserting an observed or validated Relation, Finding,
    AttackPathStep, or target conclusion. Corrections supersede existing Evidence.

    Args:
        evidence: Evidence kind, WorkItem id, stable source reference, concise
            summary, optional primary Asset and hash, capture time, and optional
            active Evidence id to supersede.

    Returns:
        JSON tool result containing the immutable Evidence record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx, evidence.work_item_id):
        return work_project_error(error)
    saved, error = await create_work_project_evidence(
        project_id, evidence,
        created_by_agent_code=ctx.context.agent_code,
        created_from_session_id=ctx.context.session_id,
    )
    return work_project_error(error) if error else work_project_success({"evidence": _dump(saved)})


@function_tool
async def invalidate_work_project_evidence_record(ctx: RunContextWrapper[AgentRuntimeContext], evidence_id: int, reason: str) -> str:
    """Invalidate erroneous active Evidence while retaining audit history.

    A specialist may invalidate only Evidence it created. Invalidation is refused
    when a reviewed WorkItem or evidence-mature conclusion would lose its last
    active supporting Evidence.

    Args:
        evidence_id: Active Evidence id to invalidate.
        reason: Specific reason the Evidence is no longer trustworthy.

    Returns:
        JSON tool result containing the invalidated Evidence id, or a gate error.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx):
        return work_project_error(error)
    error = await invalidate_work_project_evidence(
        project_id,
        evidence_id,
        reason,
        actor_agent_code=ctx.context.agent_code,
        actor_work_item_id=ctx.context.work_item_id,
    )
    return work_project_error(error) if error else work_project_success({"invalidated_evidence_id": evidence_id})


@function_tool
async def list_work_project_evidence(ctx: RunContextWrapper[AgentRuntimeContext], keyword: str = "", page: int = 1) -> str:
    """List WorkProject Evidence with stable source references.

    Args:
        keyword: Optional title, summary, reference, or kind search text.
        page: One-based result page; values below one are normalized to one.

    Returns:
        JSON tool result with pagination metadata and Evidence records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    result = await query_work_project_evidence(project_id, page=max(page, 1), size=_PAGE_SIZE, keyword=keyword)
    return work_project_success({"page": result.page, "size": result.size, "total": result.total, "evidence": [_dump(item) for item in result.items]})


@function_tool
async def save_work_project_relation(ctx: RunContextWrapper[AgentRuntimeContext], relation_id: int | None, relation: WorkProjectRelationRequest) -> str:
    """Create or update an evidence-backed environment Relation.

    Relations model structure, connectivity, dependency, identity, data flow, or
    provenance only. Attack progression belongs in AttackPaths.

    Args:
        relation_id: Existing Relation id to update, or null to upsert by endpoints and type.
        relation: Source and target Asset ids, Relation type, assertion status,
            concise summary, and active supporting Evidence ids.

    Returns:
        JSON tool result containing the saved Relation.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx):
        return work_project_error(error)
    saved, error = await upsert_work_project_relation(
        project_id, relation, relation_id=relation_id,
        created_by_agent_code=ctx.context.agent_code,
        created_from_session_id=ctx.context.session_id,
    )
    return work_project_error(error) if error else work_project_success({"relation": _dump(saved)})


@function_tool
async def list_work_project_relations(
    ctx: RunContextWrapper[AgentRuntimeContext],
    keyword: str = "",
    status: WorkProjectAssertionStatus | None = None,
    page: int = 1,
) -> str:
    """Page through environment Relations in the current WorkProject.

    Args:
        keyword: Optional summary, Relation type, or assertion-status search text.
        status: Optional exact assertion status filter.
        page: One-based result page; values below one are normalized to one.

    Returns:
        JSON tool result with pagination metadata and Relation records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    result = await query_work_project_relations(
        project_id,
        page=max(page, 1),
        size=_PAGE_SIZE,
        keyword=keyword,
        status=status,
    )
    return work_project_success({
        "page": result.page,
        "size": result.size,
        "total": result.total,
        "relations": [_dump(item) for item in result.items],
    })


@function_tool
async def list_work_project_findings(ctx: RunContextWrapper[AgentRuntimeContext], keyword: str = "", page: int = 1) -> str:
    """List suspected, validated, refuted, and deferred security Findings.

    Args:
        keyword: Optional title, description, impact, CWE, verification, or severity search text.
        page: One-based result page; values below one are normalized to one.

    Returns:
        JSON tool result with pagination metadata and Finding records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    result = await query_work_project_findings(project_id, page=max(page, 1), size=_PAGE_SIZE, keyword=keyword)
    return work_project_success({"page": result.page, "size": result.size, "total": result.total, "findings": [_dump(item) for item in result.items]})


@function_tool
async def save_work_project_finding(ctx: RunContextWrapper[AgentRuntimeContext], finding_id: int | None, finding: WorkProjectFindingRequest) -> str:
    """Create or update an evidence-backed security Finding.

    Args:
        finding_id: Existing Finding id to update, or null to create one.
        finding: Primary and affected Assets, category, verification, severity,
            technical conclusion, impact, remediation, Evidence ids, and optional
            evidence-supported CWE/CVSS classification.

    Returns:
        JSON tool result containing the saved Finding.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx):
        return work_project_error(error)
    saved, error = await save_work_project_finding_service(
        project_id, finding, finding_id=finding_id,
        created_by_agent_code=ctx.context.agent_code,
        created_from_session_id=ctx.context.session_id,
    )
    return work_project_error(error) if error else work_project_success({"finding": _dump(saved)})


@function_tool
async def save_work_project_attack_path(ctx: RunContextWrapper[AgentRuntimeContext], path_id: int | None, path: WorkProjectAttackPathRequest) -> str:
    """Atomically create or update a continuous evidence-backed AttackPath.

    Args:
        path_id: Existing AttackPath id to update, or null to create one.
        path: Entry and target Assets, objective, archive state, and the complete
            ordered sequence of actions, results, blockers, graph links, ATT&CK
            mappings, and active Evidence ids.

    Returns:
        JSON tool result containing the saved AttackPath and its ordered steps.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := await _specialist_mutation_error(ctx):
        return work_project_error(error)
    saved, steps, error = await save_work_project_attack_path_service(
        project_id, path, path_id=path_id,
        created_by_agent_code=ctx.context.agent_code,
        created_from_session_id=ctx.context.session_id,
    )
    return work_project_error(error) if error else work_project_success({"attack_path": _dump(saved), "steps": [_dump(item) for item in steps]})


@function_tool
async def list_work_project_attack_paths(
    ctx: RunContextWrapper[AgentRuntimeContext],
    keyword: str = "",
    page: int = 1,
) -> str:
    """Page through AttackPaths and their ordered validation steps.

    Args:
        keyword: Optional title, objective, or summary search text.
        page: One-based result page; values below one are normalized to one.

    Returns:
        JSON tool result with pagination metadata, derived path status, and steps.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    result = await query_work_project_attack_paths(
        project_id,
        page=max(page, 1),
        size=_PAGE_SIZE,
        keyword=keyword,
    )
    path_ids = [item.id for item in result.items]
    async with get_async_session() as session:
        steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
            WorkProjectAttackPathStep.path_id.in_(path_ids)
        ).order_by(WorkProjectAttackPathStep.path_id, WorkProjectAttackPathStep.sequence))).all()) if path_ids else []
    steps_by_path: dict[int, list[WorkProjectAttackPathStep]] = {}
    for step in steps:
        steps_by_path.setdefault(step.path_id, []).append(step)
    return work_project_success({
        "page": result.page,
        "size": result.size,
        "total": result.total,
        "attack_paths": [{
            **_dump(path),
            "status": derive_attack_path_status(
                steps_by_path.get(path.id, []),
                path.archived_at,
            ).value,
            "steps": [_dump(item) for item in steps_by_path.get(path.id, [])],
        } for path in result.items],
    })


@function_tool
async def create_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    plan: WorkProjectWorkItemPlanRequest,
) -> str:
    """Create a queued graph-targeted WorkItem; cso only.

    Args:
        plan: Immutable execution plan containing assignee, objective, scope,
            completion criteria, dependencies, graph focus, and target surfaces.

    Returns:
        JSON tool result containing the new queued WorkItem.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await create_work_project_work_item_service(
        project_id,
        plan,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def update_work_project_work_item_plan(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    plan: WorkProjectWorkItemPlanRequest,
) -> str:
    """Replace the plan of a queued WorkItem before activation; cso only.

    Args:
        work_item_id: Queued WorkItem id whose plan will be replaced.
        plan: Complete immutable execution plan and target surface set.

    Returns:
        JSON tool result containing the updated queued WorkItem.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await update_work_project_work_item_plan_service(
        project_id,
        work_item_id,
        plan,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def activate_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    reason: str,
) -> str:
    """Activate queued work as cso or resume the bound blocked WorkItem as its assignee.

    Args:
        work_item_id: Queued or blocked WorkItem id.
        reason: Specific activation or blocker-resolution reason for the WorkLog.

    Returns:
        JSON tool result containing the active WorkItem, or a scope/dependency error.
    """
    if error := _specialist_work_item_error(ctx, work_item_id):
        return work_project_error(error)
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await activate_work_project_work_item_service(
        project_id,
        work_item_id,
        reason,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def update_work_project_work_item_target(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    target: WorkProjectWorkItemTargetUpdateRequest,
) -> str:
    """Update one target surface on the active runtime-bound WorkItem.

    Args:
        work_item_id: Active WorkItem id.
        target: Exact asset and surface plus active, covered, or deferred state;
            covered requires a conclusion and deferred requires a reason.

    Returns:
        JSON tool result containing the updated target surface.
    """
    if error := _specialist_work_item_error(ctx, work_item_id):
        return work_project_error(error)
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await update_work_project_work_item_target_service(
        project_id,
        work_item_id,
        target,
        actor_agent_code=ctx.context.agent_code,
    )
    return work_project_error(error) if error else work_project_success({"target": _dump(saved)})


@function_tool
async def block_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    targets: list[WorkProjectWorkItemTargetKey],
    reason: str,
) -> str:
    """Block an active WorkItem and atomically mark the affected target surfaces blocked.

    Args:
        work_item_id: Active WorkItem id.
        targets: One or more exact asset and surface targets affected by the blocker.
        reason: Concrete blocker and the condition required to resume.

    Returns:
        JSON tool result containing the blocked WorkItem.
    """
    if error := _specialist_work_item_error(ctx, work_item_id):
        return work_project_error(error)
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await block_work_project_work_item_service(
        project_id,
        work_item_id,
        targets,
        reason,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def submit_work_project_work_item_review(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    result_summary: str,
) -> str:
    """Submit an active WorkItem to cso review after all target and Evidence gates pass.

    Args:
        work_item_id: Active runtime-bound WorkItem id.
        result_summary: Complete evidence-based result, valuable negatives, residual
            limitations, and handoff implications.

    Returns:
        JSON tool result containing the WorkItem in review state.
    """
    if error := _specialist_work_item_error(ctx, work_item_id):
        return work_project_error(error)
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await submit_work_project_work_item_review_service(
        project_id,
        work_item_id,
        result_summary,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def review_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    decision: WorkProjectReviewDecision,
    reason: str,
    reopened_targets: list[WorkProjectWorkItemTargetKey],
) -> str:
    """Accept a reviewed WorkItem or return named target surfaces to active work; cso only.

    Args:
        work_item_id: WorkItem currently awaiting review.
        decision: accept to complete, or request_changes to return work to active.
        reason: Evidence-based review conclusion recorded in WorkLog.
        reopened_targets: Empty when accepting; exact targets requiring more work
            when requesting changes.

    Returns:
        JSON tool result containing the completed or reactivated WorkItem.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await review_work_project_work_item_service(
        project_id,
        work_item_id,
        decision,
        reason,
        reopened_targets,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def cancel_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    reason: str,
) -> str:
    """Cancel a non-terminal WorkItem with an explicit governance reason; cso only.

    Args:
        work_item_id: Non-terminal WorkItem id.
        reason: Scope, duplication, risk, priority, or planning reason for cancellation.

    Returns:
        JSON tool result containing the canceled WorkItem.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await cancel_work_project_work_item_service(
        project_id,
        work_item_id,
        reason,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def reopen_work_project_work_item(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
    reason: str,
) -> str:
    """Reopen a completed or canceled WorkItem as queued and reset its targets; cso only.

    Args:
        work_item_id: Terminal WorkItem id.
        reason: New evidence, scope, or retest trigger requiring renewed execution.

    Returns:
        JSON tool result containing the reopened queued WorkItem.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    saved, error = await reopen_work_project_work_item_service(
        project_id,
        work_item_id,
        reason,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return _work_item_result(saved, error)


@function_tool
async def record_work_project_work_log(ctx: RunContextWrapper[AgentRuntimeContext], work_item_id: int, entry: WorkProjectWorkLogRequest) -> str:
    """Record a durable WorkLog entry for an assigned WorkItem.

    Args:
        work_item_id: WorkItem receiving the timeline entry.
        entry: Decision, blocker, handoff, or result kind and concise content.

    Returns:
        JSON tool result containing the persisted WorkLog entry.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if error := _specialist_work_item_error(ctx, work_item_id):
        return work_project_error(error)
    saved, error = await create_work_project_work_log(
        project_id, work_item_id, entry,
        actor_agent_code=ctx.context.agent_code,
        actor_session_id=ctx.context.session_id,
    )
    return work_project_error(error) if error else work_project_success({"work_log": _dump(saved)})


@function_tool
async def complete_current_work_project(ctx: RunContextWrapper[AgentRuntimeContext]) -> str:
    """Close the current WorkProject after all review gates pass.

    This operation is restricted to cso. Closure requires terminal WorkItems,
    concluded in-scope coverage, resolved Findings, and resolved AttackPaths.

    Returns:
        JSON tool result containing the completed project id and status, or the
        first unmet review gate.
    """
    if ctx.context.agent_code != DEFAULT_AGENT_CODE:
        return work_project_error("Only the cso agent can complete a WorkProject.")
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    from service.work_project.projects import complete_work_project
    error = await complete_work_project(project_id)
    return work_project_error(error) if error else work_project_success({"project_id": project_id, "status": "completed"})


def _project_id(ctx: RunContextWrapper[AgentRuntimeContext]) -> int | None:
    return ctx.context.work_project_id


def _specialist_work_item_error(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int,
) -> str:
    if ctx.context.agent_code == DEFAULT_AGENT_CODE:
        return ""
    if ctx.context.work_item_id is None:
        return "No WorkItem is bound to this specialist runtime."
    if ctx.context.work_item_id != work_item_id:
        return "Specialists can mutate only their runtime-bound WorkItem."
    return ""


async def _specialist_mutation_error(
    ctx: RunContextWrapper[AgentRuntimeContext],
    work_item_id: int | None = None,
) -> str:
    if ctx.context.agent_code == DEFAULT_AGENT_CODE:
        return ""
    bound_id = ctx.context.work_item_id
    if bound_id is None:
        return "No WorkItem is bound to this specialist runtime."
    if work_item_id is not None and work_item_id != bound_id:
        return "Specialists can mutate only their runtime-bound WorkItem."
    project_id = _project_id(ctx)
    async with get_async_session() as session:
        item = await session.get(WorkProjectWorkItem, bound_id)
    if item is None or item.project_id != project_id:
        return "The runtime-bound WorkItem was not found in this WorkProject."
    if item.assignee_agent_code != ctx.context.agent_code:
        return "The runtime-bound WorkItem is assigned to another Agent."
    if item.status not in {
        WorkProjectWorkItemStatus.ACTIVE,
        WorkProjectWorkItemStatus.BLOCKED,
    }:
        return "Specialist project mutations require an active or blocked runtime-bound WorkItem."
    return ""


def _work_item_result(saved, error: str) -> str:
    return work_project_error(error) if error else work_project_success({"work_item": _dump(saved)})


def _dump(value) -> dict:
    if value is None:
        return {}
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else {
        key: getattr(value, key) for key in value.__class__.model_fields
    }


def _compact(value, keys: tuple[str, ...]) -> dict:
    return {key: getattr(value, key, None) for key in keys}


def _compact_asset(value) -> dict:
    return _compact(value, ("id", "kind", "locator", "name", "scope", "criticality", "state", "summary"))
