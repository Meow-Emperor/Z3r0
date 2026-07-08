from agents import RunContextWrapper, function_tool

from core.runtime.context import AgentRuntimeContext
from schema.common.tool_results import ToolResultSchema, ToolResultStatusSchema, ToolResultTypeSchema
from service.agent.reports import export_session_report


@function_tool
async def export_report(ctx: RunContextWrapper[AgentRuntimeContext], content: str) -> str:
    """Export a markdown report for the current session.

    Args:
        content: str complete report content in standard Markdown.

    Returns:
        JSON tool result with report id, filename, byte size, and character count.
    """
    try:
        report = await export_session_report(ctx.context.session_id, content)
    except Exception as exc:
        return _report_result(ToolResultStatusSchema.ERROR, str(exc) or "Report export failed.")

    return _report_result(
        ToolResultStatusSchema.SUCCESS,
        report.model_dump_json(),
    )


def _report_result(status: ToolResultStatusSchema, output: str) -> str:
    return ToolResultSchema(
        status=status,
        type=ToolResultTypeSchema.REPORT,
        output=output,
    ).model_dump_json()
