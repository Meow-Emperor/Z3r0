import json
from datetime import datetime
from enum import StrEnum

from agents import RunContextWrapper, function_tool
from sqlalchemy import Text, cast, func, literal, update
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, array
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from core.runtime.context import AgentRuntimeContext
from database import get_async_session
from model.work_project.projects import WorkProject
from model.work_project.projects import WorkProjectSandboxContainer
from schema.common.tool_results import ToolResultSchema, ToolResultStatusSchema, ToolResultTypeSchema
from schema.work_project.assets import WorkProjectAssetRequest
from schema.work_project.findings import WorkProjectFindingRequest
from schema.work_project.graph import (
    WorkProjectAttackPathRequest,
    WorkProjectAttackPathStepRequest,
    WorkProjectGraphEdgeRequest,
)
from schema.work_project.projects import (
    WorkProjectAgentSummaryContentSchema,
    WorkProjectAgentSummarySchema,
    WorkProjectTaskSchema,
)
from service.work_project.assets import (
    delete_work_project_asset,
    query_work_project_assets,
    update_work_project_asset,
    upsert_work_project_asset,
)
from service.work_project.findings import (
    create_work_project_finding,
    delete_work_project_finding,
    query_work_project_findings,
    update_work_project_finding,
)
from service.work_project.graph import (
    create_work_project_attack_path,
    create_work_project_attack_path_step,
    delete_work_project_attack_path,
    delete_work_project_attack_path_step,
    delete_work_project_graph_edge,
    query_work_project_graph,
    update_work_project_attack_path,
    update_work_project_attack_path_step,
    update_work_project_graph_edge,
    upsert_work_project_graph_edge,
)
from service.work_project.progress import calculate_work_project_progress, derive_work_project_status


_AGENT_PAGE_SIZE = 50
_AGENT_GRAPH_ITEMS = 40
_MAX_TOOL_TEXT = 500


class WorkProjectRecordType(StrEnum):
    ASSET = "asset"
    FINDING = "finding"
    GRAPH_EDGE = "graph_edge"
    ATTACK_PATH = "attack_path"
    ATTACK_PATH_STEP = "attack_path_step"


def work_project_success(payload: object) -> str:
    return ToolResultSchema(
        status=ToolResultStatusSchema.SUCCESS,
        type=ToolResultTypeSchema.WORK_PROJECT,
        output=json.dumps(payload, ensure_ascii=False),
    ).model_dump_json()


def work_project_error(message: str) -> str:
    return ToolResultSchema(
        status=ToolResultStatusSchema.ERROR,
        type=ToolResultTypeSchema.WORK_PROJECT,
        output=message,
    ).model_dump_json()


@function_tool
async def load_work_project_metadata(ctx: RunContextWrapper[AgentRuntimeContext]) -> str:
    """Load metadata for the WorkProject bound to the current session.

    Args:
        None.

    Returns:
        JSON status with project id, name, description, sandbox container id, status, and type.
    """
    project = await _current_project(ctx.context)
    if project is None:
        return work_project_error("No WorkProject is bound to this session.")
    return work_project_success(await _metadata_payload(project))


@function_tool
async def load_work_project_tasks(ctx: RunContextWrapper[AgentRuntimeContext]) -> str:
    """Load the shared task list for the WorkProject bound to the current session.

    Args:
        None.

    Returns:
        JSON status with project_id, code-calculated overall progress, and shared task records.
    """
    project = await _current_project(ctx.context)
    if project is None:
        return work_project_error("No WorkProject is bound to this session.")
    return work_project_success(_tasks_payload(project))


@function_tool
async def load_work_project_agent_summaries(ctx: RunContextWrapper[AgentRuntimeContext]) -> str:
    """Load all agent summary slots for the WorkProject bound to the current session.

    Args:
        None.

    Returns:
        JSON status with project_id and structured summaries written by participating agents.
    """
    project = await _current_project(ctx.context)
    if project is None:
        return work_project_error("No WorkProject is bound to this session.")
    return work_project_success(_agent_summaries_payload(project))


@function_tool
async def update_work_project_agent_summary(
    ctx: RunContextWrapper[AgentRuntimeContext],
    summary: WorkProjectAgentSummaryContentSchema,
) -> str:
    """Replace this agent's live structured task summary for the current WorkProject.

    Each agent can only write its own summary slot, keyed by agent_code.
    Call after meaningful discoveries, useful negative results, blockers,
    decisions, handoffs, or progress changes, before the next command, delegated task, handoff, or user reply when practical.
    Keep the summary current throughout the task.
    Use task_id/task_title and progress (0-100, at most two decimals) to report this agent's current subtask progress.

    Args:
        summary: WorkProjectAgentSummaryContentSchema full replacement for this agent's current summary.
            Include task_id/task_title,
            progress, status, findings, decisions, blockers, next_steps, and notes as applicable.
            When task_id or exact task_title matches a shared task, that task's progress is synchronized.
            Overall project progress is recalculated by code and is not an input.

    Returns:
        JSON status with project_id and all current structured agent summaries.
    """
    agent_code = ctx.context.agent_code.strip()
    if not agent_code:
        return work_project_error("Agent code is required.")
    project_id = ctx.context.work_project_id
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")

    now = datetime.now()
    payload = {
        "agent_code": agent_code,
        "summary": summary.model_dump(mode="json"),
        "updated_at": now.isoformat(),
    }
    async with get_async_session() as session:
        result = await session.execute(
            update(WorkProject)
            .where(WorkProject.id == project_id)
            .values(
                agent_summaries=func.jsonb_set(
                    func.coalesce(WorkProject.agent_summaries, literal({}, type_=JSONB)),
                    cast(array([agent_code]), ARRAY(Text)),
                    literal(payload, type_=JSONB),
                    True,
                ),
                updated_at=now,
            )
            .returning(WorkProject.id)
        )
        updated_project_id = result.scalar_one_or_none()
        if updated_project_id is None:
            await session.rollback()
            return work_project_error("WorkProject not found.")
        project = (await session.exec(
            select(WorkProject)
            .where(WorkProject.id == project_id)
            .with_for_update()
        )).first()
        if project is None:
            await session.rollback()
            return work_project_error("WorkProject not found.")
        _sync_summary_progress_to_task(project, summary)
        session.add(project)
        await session.commit()
        await session.refresh(project)

    return work_project_success(_agent_summaries_payload(project))


@function_tool
async def update_work_project_tasks(
    ctx: RunContextWrapper[AgentRuntimeContext],
    tasks: list[WorkProjectTaskSchema],
) -> str:
    """Update the shared WorkProject task list.

    Only the chief security officer agent (`cso`) can update the shared project task list.
    Call when global task state changes, including after your own progress or subagent results,
    before reporting or delegating more work when practical.
    Each task status must be one of: todo, in_progress, blocked, done.
    Each task progress value must be 0-100 with at most two decimal places.
    Do not provide or estimate overall project progress; it is recalculated by code from task progress.

    Args:
        tasks: list[WorkProjectTaskSchema] complete desired task list after applying your changes.
            Preserve existing tasks that still matter,
            update status/progress/summary, and add or remove tasks only when the project plan changes.

    Returns:
        JSON status with project_id, recalculated overall progress, and the saved shared task list.
    """
    # The default agent code is the chief security officer (cso), the sole owner of the shared task list.
    if ctx.context.agent_code != DEFAULT_AGENT_CODE:
        return work_project_error("Only the cso agent can update the shared WorkProject task list.")
    project_id = ctx.context.work_project_id
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")

    async with get_async_session() as session:
        project = await session.get(WorkProject, project_id)
        if project is None:
            return work_project_error("WorkProject not found.")
        project.tasks = [task.model_dump(mode="json") for task in tasks]
        _recalculate_project_progress(project)
        project.updated_at = datetime.now()
        session.add(project)
        await session.commit()
        await session.refresh(project)

    return work_project_success(_tasks_payload(project))


@function_tool
async def list_work_project_assets(
    ctx: RunContextWrapper[AgentRuntimeContext],
    keyword: str = "",
    page: int = 1,
) -> str:
    """List durable Asset records for the current WorkProject.

    Results are paginated to keep model context small. Increase page to continue reading when total exceeds size.

    Args:
        keyword: str optional search term matched against asset identifier, host, path, or type.
        page: int one-based result page. Use page > 1 when total exceeds size.

    Returns:
        JSON status with page, size, total, and compact asset records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    page_result = await query_work_project_assets(
        project_id,
        page=_agent_page(page),
        size=_AGENT_PAGE_SIZE,
        keyword=keyword,
    )
    return work_project_success({
        "page": page_result.page,
        "size": page_result.size,
        "total": page_result.total,
        "assets": [_compact_asset(item.model_dump(mode="json")) for item in page_result.items],
    })


@function_tool
async def create_or_update_work_project_asset(
    ctx: RunContextWrapper[AgentRuntimeContext],
    asset_id: int | None,
    asset: WorkProjectAssetRequest,
) -> str:
    """Create or update a durable Asset record for the current WorkProject.

    Omit asset_id to upsert by the normalized (type, identifier) identity; provide asset_id to update a specific record.
    Asset type is one of service, domain, network, binary. Required base fields depend on type:
    service/domain/network require host (port is optional for service); binary requires path.
    Put a short recon banner in extra; keep it small and reference large output from a finding instead.
    Asset origin (scope vs discovered) is managed by the system and is not settable here.
    Scope asset identity is managed by project metadata; when updating a scope asset, keep type/host/port/path unchanged.

    Args:
        asset_id: int | None asset id to update. Use null to upsert by normalized (type, identifier).
        asset: WorkProjectAssetRequest containing type plus host/port/path and optional extra.banner.

    Returns:
        JSON status with the compact saved asset record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if asset_id is None:
        saved, error = await upsert_work_project_asset(
            project_id,
            asset,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_asset(project_id, asset_id, asset)
    if error:
        return work_project_error(error)
    return work_project_success({"asset": _compact_asset(_dump(saved))})


@function_tool
async def list_work_project_findings(
    ctx: RunContextWrapper[AgentRuntimeContext],
    keyword: str = "",
    page: int = 1,
) -> str:
    """List durable Finding records for the current WorkProject.

    Results are paginated to keep model context small. Increase page to continue reading when total exceeds size.

    Args:
        keyword: str optional search term matched against finding title, description, impact, severity, or status.
        page: int one-based result page. Use page > 1 when total exceeds size.

    Returns:
        JSON status with page, size, total, and compact finding records.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    page_result = await query_work_project_findings(
        project_id,
        page=_agent_page(page),
        size=_AGENT_PAGE_SIZE,
        keyword=keyword,
    )
    return work_project_success({
        "page": page_result.page,
        "size": page_result.size,
        "total": page_result.total,
        "findings": [_compact_finding(item.model_dump(mode="json")) for item in page_result.items],
    })


@function_tool
async def create_or_update_work_project_finding(
    ctx: RunContextWrapper[AgentRuntimeContext],
    finding_id: int | None,
    finding: WorkProjectFindingRequest,
) -> str:
    """Create or update a durable Finding record for the current WorkProject.

    A finding describes a weakness or proven issue. Set asset_id to the affected asset.
    When a finding substantiates a relationship or attack step, set edge_id to that graph edge.
    status is one of suspected, validated, false_positive; the finding's description and impact
    carry the proof, so mark it validated only once it is actually confirmed.

    Args:
        finding_id: int | None finding id to update. Use null to create a new finding.
        finding: WorkProjectFindingRequest with asset_id/edge_id, title, severity, status, description, and impact.

    Returns:
        JSON status with the compact saved finding record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if finding_id is None:
        saved, error = await create_work_project_finding(
            project_id,
            finding,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_finding(project_id, finding_id, finding)
    if error:
        return work_project_error(error)
    return work_project_success({"finding": _compact_finding(_dump(saved))})


@function_tool
async def load_work_project_graph(
    ctx: RunContextWrapper[AgentRuntimeContext],
    page: int = 1,
) -> str:
    """Load durable relationship edges, attack paths, and ordered path steps.

    Graph nodes are the project assets; edges connect two assets. Use list_work_project_assets for node detail.
    Results are paginated to keep model context small. Increase page to continue reading when a total exceeds size.

    Args:
        page: int one-based graph page. Applies separately to edges, attack paths, and attack path steps.

    Returns:
        JSON status with total counts, page, size, compact edges, compact attack paths, and compact path steps.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    page = _agent_page(page)
    graph_page = await query_work_project_graph(
        project_id,
        page=page,
        size=_AGENT_GRAPH_ITEMS,
    )
    return work_project_success({
        "counts": {
            "edges": graph_page.edge_total,
            "attack_paths": graph_page.attack_path_total,
            "attack_path_steps": graph_page.attack_path_step_total,
        },
        "page": page,
        "size": _AGENT_GRAPH_ITEMS,
        "edges": [_compact_edge(item.model_dump(mode="json")) for item in graph_page.edges],
        "attack_paths": [_compact_attack_path(item.model_dump(mode="json")) for item in graph_page.attack_paths],
        "attack_path_steps": [
            _compact_attack_path_step(item.model_dump(mode="json"))
            for item in graph_page.attack_path_steps
        ],
    })


@function_tool
async def create_or_update_work_project_graph_edge(
    ctx: RunContextWrapper[AgentRuntimeContext],
    edge_id: int | None,
    edge: WorkProjectGraphEdgeRequest,
) -> str:
    """Create or update a relationship edge between two assets for the current WorkProject.

    Omit edge_id to upsert by (source_asset_id, target_asset_id, type); provide edge_id to update one edge.
    The edge type is either structural (related, resolves_to, hosts, connects_to, trusts) to describe the
    target architecture, or offensive (exploits, pivots_to, leads_to) to describe how an attack progresses,
    directed from source_asset_id to target_asset_id.

    Args:
        edge_id: int | None graph edge id to update. Use null to upsert by source_asset_id, target_asset_id, and type.
        edge: WorkProjectGraphEdgeRequest with source_asset_id, target_asset_id, type, and optional label.

    Returns:
        JSON status with the compact saved graph edge record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if edge_id is None:
        saved, error = await upsert_work_project_graph_edge(
            project_id,
            edge,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_graph_edge(project_id, edge_id, edge)
    if error:
        return work_project_error(error)
    return work_project_success({"edge": _compact_edge(_dump(saved))})


@function_tool
async def create_or_update_work_project_attack_path(
    ctx: RunContextWrapper[AgentRuntimeContext],
    path_id: int | None,
    path: WorkProjectAttackPathRequest,
) -> str:
    """Create or update a durable attack path for the current WorkProject.

    Args:
        path_id: int | None attack path id to update. Use null to create a new attack path.
        path: WorkProjectAttackPathRequest with title, status, and summary.

    Returns:
        JSON status with the compact saved attack path record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if path_id is None:
        saved, error = await create_work_project_attack_path(
            project_id,
            path,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_attack_path(project_id, path_id, path)
    if error:
        return work_project_error(error)
    return work_project_success({"attack_path": _compact_attack_path(_dump(saved))})


@function_tool
async def create_or_update_work_project_attack_path_step(
    ctx: RunContextWrapper[AgentRuntimeContext],
    path_id: int,
    step_id: int | None,
    step: WorkProjectAttackPathStepRequest,
) -> str:
    """Create or update one ordered attack path step.

    Each step traverses a single relationship edge (edge_id), in order by sequence.

    Args:
        path_id: int parent attack path id.
        step_id: int | None attack path step id to update. Use null to create a new step.
        step: WorkProjectAttackPathStepRequest with sequence and edge_id.

    Returns:
        JSON status with the compact saved attack path step record.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if step_id is None:
        saved, error = await create_work_project_attack_path_step(
            project_id,
            path_id,
            step,
            created_by_agent_code=ctx.context.agent_code,
            created_from_session_id=ctx.context.session_id,
        )
    else:
        saved, error = await update_work_project_attack_path_step(project_id, path_id, step_id, step)
    if error:
        return work_project_error(error)
    return work_project_success({"attack_path_step": _compact_attack_path_step(_dump(saved))})


@function_tool
async def delete_work_project_record(
    ctx: RunContextWrapper[AgentRuntimeContext],
    record_type: WorkProjectRecordType,
    record_id: int,
    path_id: int | None = None,
) -> str:
    """Permanently delete a durable WorkProject record and detach its references.

    record_type selects the record kind; record_id is that record's id.
    For an attack_path_step, also provide path_id. Deleting an asset removes the edges that touch it
    and detaches findings; scope assets cannot be deleted here and must be removed from project metadata.
    Deleting an edge removes the steps that traverse it and detaches findings.

    Args:
        record_type: WorkProjectRecordType record kind to delete: asset, finding, graph_edge, attack_path, or attack_path_step.
        record_id: int id of the selected record.
        path_id: int | None parent attack path id, required only when record_type is attack_path_step.

    Returns:
        JSON status with the deleted record type and id.
    """
    project_id = _project_id(ctx)
    if project_id is None:
        return work_project_error("No WorkProject is bound to this session.")
    if record_type == WorkProjectRecordType.ASSET:
        error = await delete_work_project_asset(project_id, record_id)
    elif record_type == WorkProjectRecordType.FINDING:
        error = await delete_work_project_finding(project_id, record_id)
    elif record_type == WorkProjectRecordType.GRAPH_EDGE:
        error = await delete_work_project_graph_edge(project_id, record_id)
    elif record_type == WorkProjectRecordType.ATTACK_PATH:
        error = await delete_work_project_attack_path(project_id, record_id)
    else:  # ATTACK_PATH_STEP
        if path_id is None:
            return work_project_error("path_id is required to delete an attack path step.")
        error = await delete_work_project_attack_path_step(project_id, path_id, record_id)
    if error:
        return work_project_error(error)
    return work_project_success({"deleted": {"type": record_type.value, "id": record_id}})


async def _current_project(context: AgentRuntimeContext) -> WorkProject | None:
    if context.work_project_id is None:
        return None
    async with get_async_session() as session:
        return await session.get(WorkProject, context.work_project_id)


async def _metadata_payload(project: WorkProject) -> dict:
    async with get_async_session() as session:
        container_id = (await session.exec(
            select(WorkProjectSandboxContainer.sandbox_container_id)
            .where(WorkProjectSandboxContainer.project_id == project.id)
            .order_by(WorkProjectSandboxContainer.position)
            .limit(1)
        )).first()
    return {
        "project_id": project.id,
        "name": project.name,
        "description": project.description,
        "sandbox_container_id": container_id,
        "status": project.status,
        "type": project.type,
    }


def _tasks_payload(project: WorkProject) -> dict:
    return {
        "project_id": project.id,
        "progress": project.progress,
        "tasks": [
            WorkProjectTaskSchema.model_validate(task).model_dump(mode="json")
            for task in project.tasks
        ],
    }


def _agent_summaries_payload(project: WorkProject) -> dict:
    summaries = [
        WorkProjectAgentSummarySchema.model_validate(summary).model_dump(mode="json")
        for summary in (project.agent_summaries or {}).values()
        if isinstance(summary, dict)
    ]
    return {
        "project_id": project.id,
        "agent_summaries": summaries,
    }


def _sync_summary_progress_to_task(
    project: WorkProject,
    summary: WorkProjectAgentSummaryContentSchema,
) -> None:
    task_id = summary.task_id.strip()
    task_title = summary.task_title.strip()
    if not task_id and not task_title:
        return

    tasks: list[dict] = []
    changed = False
    for raw_task in project.tasks:
        task = WorkProjectTaskSchema.model_validate(raw_task)
        if task.id == task_id or (not task_id and task.title == task_title):
            task.progress = summary.progress
            changed = True
        tasks.append(task.model_dump(mode="json"))

    if not changed:
        return
    project.tasks = tasks
    _recalculate_project_progress(project)


def _recalculate_project_progress(project: WorkProject) -> None:
    project.progress = calculate_work_project_progress(project.tasks)
    project.status = derive_work_project_status(project.tasks, project.status)


def _project_id(ctx: RunContextWrapper[AgentRuntimeContext]) -> int | None:
    return ctx.context.work_project_id


def _agent_page(page: int) -> int:
    return page if page > 0 else 1


def _compact_asset(item: dict) -> dict:
    compact = _pick(item, (
        "id", "type", "origin", "identifier", "host", "port", "path",
    ))
    banner = (item.get("extra") or {}).get("banner")
    if banner:
        compact["banner"] = _compact_value(banner)
    return compact


def _compact_finding(item: dict) -> dict:
    return _pick(item, ("id", "asset_id", "edge_id", "title", "severity", "status", "description", "impact", "validated_at"))


def _compact_edge(item: dict) -> dict:
    return _pick(item, ("id", "source_asset_id", "target_asset_id", "type", "label"))


def _compact_attack_path(item: dict) -> dict:
    return _pick(item, ("id", "title", "status", "summary"))


def _compact_attack_path_step(item: dict) -> dict:
    return _pick(item, ("id", "path_id", "sequence", "edge_id"))


def _dump(value) -> dict:
    return value.model_dump(mode="json") if value else {}


def _pick(item: dict, keys: tuple[str, ...]) -> dict:
    return {
        key: _compact_value(item.get(key))
        for key in keys
        if item.get(key) not in (None, "", [])
    }


def _compact_value(value):
    if isinstance(value, str) and len(value) > _MAX_TOOL_TEXT:
        return value[:_MAX_TOOL_TEXT - 3].rstrip() + "..."
    return value
