from agents import RunContextWrapper, function_tool

from core.runtime.context import AgentRuntimeContext
from schema.common.tool_results import ToolResultSchema, ToolResultStatusSchema, ToolResultTypeSchema
from service.agent.reports import export_session_report


@function_tool
async def export_report(ctx: RunContextWrapper[AgentRuntimeContext], content: str) -> str:
    """Export a markdown report for the current session.

    The result reports success or failure and, on success, includes the report
    identity, filename, byte size, and character count.

    Args:
        content: Complete report body in standard Markdown.

    Returns:
        A JSON tool result containing the export status and report metadata.
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
