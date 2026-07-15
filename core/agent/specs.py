from dataclasses import dataclass

from agents import Tool

from core.agent.constants import DEFAULT_AGENT_CODE, SPECIALIST_AGENT_CODES
from core.tools.reports import export_report
from core.tools.work_project import (
    activate_work_project_work_item,
    block_work_project_work_item,
    cancel_work_project_work_item,
    complete_current_work_project,
    create_work_project_work_item,
    get_work_project_work_item,
    invalidate_work_project_evidence_record,
    list_work_project_assets,
    list_work_project_attack_paths,
    list_work_project_evidence,
    list_work_project_findings,
    list_work_project_relations,
    list_work_project_work_items,
    load_work_project_context,
    merge_work_project_asset_records,
    record_work_project_evidence,
    record_work_project_work_log,
    reopen_work_project_work_item,
    review_work_project_work_item,
    save_work_project_asset,
    save_work_project_attack_path,
    save_work_project_finding,
    save_work_project_relation,
    submit_work_project_work_item_review,
    update_work_project_work_item_plan,
    update_work_project_work_item_target,
)
from core.tools.sandbox import (
    cancel_sandbox_async_job,
    execute_async_command,
    execute_sync_command,
    load_skill,
    read_sandbox_command_output,
)


@dataclass(frozen=True, slots=True)
class ToolMount:
    tool: Tool
    requires_sandbox_container: bool = False
    requires_work_project: bool = False


@dataclass(frozen=True, slots=True)
class SubagentMount:
    code: str


@dataclass(frozen=True, slots=True)
class AgentSpec:
    code: str
    tools: tuple[ToolMount, ...] = ()
    subagents: tuple[SubagentMount, ...] = ()


WORK_PROJECT_TOOLS = (
    ToolMount(load_work_project_context, requires_work_project=True),
    ToolMount(list_work_project_work_items, requires_work_project=True),
    ToolMount(get_work_project_work_item, requires_work_project=True),
    ToolMount(activate_work_project_work_item, requires_work_project=True),
    ToolMount(update_work_project_work_item_target, requires_work_project=True),
    ToolMount(block_work_project_work_item, requires_work_project=True),
    ToolMount(submit_work_project_work_item_review, requires_work_project=True),
    ToolMount(record_work_project_work_log, requires_work_project=True),
)

WORK_PROJECT_GOVERNANCE_TOOLS = (
    ToolMount(create_work_project_work_item, requires_work_project=True),
    ToolMount(update_work_project_work_item_plan, requires_work_project=True),
    ToolMount(review_work_project_work_item, requires_work_project=True),
    ToolMount(cancel_work_project_work_item, requires_work_project=True),
    ToolMount(reopen_work_project_work_item, requires_work_project=True),
)

WORK_PROJECT_RECORD_TOOLS = (
    ToolMount(list_work_project_assets, requires_work_project=True),
    ToolMount(save_work_project_asset, requires_work_project=True),
    ToolMount(list_work_project_relations, requires_work_project=True),
    ToolMount(list_work_project_evidence, requires_work_project=True),
    ToolMount(record_work_project_evidence, requires_work_project=True),
    ToolMount(invalidate_work_project_evidence_record, requires_work_project=True),
    ToolMount(list_work_project_findings, requires_work_project=True),
    ToolMount(save_work_project_finding, requires_work_project=True),
    ToolMount(save_work_project_relation, requires_work_project=True),
    ToolMount(list_work_project_attack_paths, requires_work_project=True),
    ToolMount(save_work_project_attack_path, requires_work_project=True),
)

SANDBOX_TOOLS = (
    ToolMount(execute_sync_command, requires_sandbox_container=True),
    ToolMount(read_sandbox_command_output, requires_sandbox_container=True),
    ToolMount(execute_async_command, requires_sandbox_container=True),
    ToolMount(cancel_sandbox_async_job, requires_sandbox_container=True),
    ToolMount(load_skill, requires_sandbox_container=True),
)


SPECIALIST_TOOLS = (
    *SANDBOX_TOOLS,
    *WORK_PROJECT_TOOLS,
    *WORK_PROJECT_RECORD_TOOLS,
)

AGENT_SPECS: tuple[AgentSpec, ...] = (
    AgentSpec(
        code=DEFAULT_AGENT_CODE,
        tools=(
            *WORK_PROJECT_TOOLS,
            *WORK_PROJECT_GOVERNANCE_TOOLS,
            *WORK_PROJECT_RECORD_TOOLS,
            ToolMount(merge_work_project_asset_records, requires_work_project=True),
            ToolMount(complete_current_work_project, requires_work_project=True),
            ToolMount(export_report),
        ),
        subagents=tuple(SubagentMount(code=code) for code in SPECIALIST_AGENT_CODES),
    ),
    *(AgentSpec(code=code, tools=SPECIALIST_TOOLS) for code in SPECIALIST_AGENT_CODES),
)
