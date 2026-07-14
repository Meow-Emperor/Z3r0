import { TOOL_RESULT_STATUS, TOOL_RESULT_TYPE, TOOL_RESULT_TYPE_VALUES } from "../../shared/api/generated/constants";
import type {
  ReportToolResultOutput,
  ToolResultEvent,
  ToolResultSchema,
  ToolResultType,
} from "../../shared/api/types";
import type { ReportAttachmentItem, TranscriptAttachmentItem } from "./transcriptTypes";

type ToolResultAttachmentExtractor = (context: {
  event: ToolResultEvent;
  result: ToolResultSchema;
}) => TranscriptAttachmentItem | null;

const TOOL_RESULT_ATTACHMENT_EXTRACTORS: Partial<Record<ToolResultType, ToolResultAttachmentExtractor>> = {
  [TOOL_RESULT_TYPE.REPORT]: reportAttachmentFromToolResult,
};

const TOOL_RESULT_TYPE_SET = new Set<string>(TOOL_RESULT_TYPE_VALUES);
const TOOL_RESULT_ATTACHMENT_TYPE_PATTERN = new RegExp(
  `"type"\\s*:\\s*"(?:${Object.keys(TOOL_RESULT_ATTACHMENT_EXTRACTORS).map(escapeRegExp).join("|")})"`,
);

const TRANSCRIPT_ATTACHMENT_IDENTITIES: {
  [Kind in TranscriptAttachmentItem["kind"]]: (
    item: Extract<TranscriptAttachmentItem, { kind: Kind }>
  ) => string;
} = {
  report: (item) => `report:${item.reportId}`,
};

export function attachmentFromToolResult(event: ToolResultEvent): TranscriptAttachmentItem | null {
  if (!maybeAttachmentToolResult(event.output)) return null;
  const result = parseToolResult(event.output);
  if (!result || result.status !== TOOL_RESULT_STATUS.SUCCESS) return null;
  return TOOL_RESULT_ATTACHMENT_EXTRACTORS[result.type]?.({ event, result }) ?? null;
}

export function transcriptAttachmentIdentity(item: TranscriptAttachmentItem): string {
  const identity = TRANSCRIPT_ATTACHMENT_IDENTITIES[item.kind] as (item: TranscriptAttachmentItem) => string;
  return identity(item);
}

function reportAttachmentFromToolResult({
  event,
  result,
}: {
  event: ToolResultEvent;
  result: ToolResultSchema;
}): ReportAttachmentItem | null {
  const report = parseJsonObject(result.output);
  if (!isReportToolResultOutput(report)) return null;
  return {
    kind: "report",
    id: `report:${report.report_id}`,
    callId: event.call_id,
    reportId: report.report_id,
    filename: report.filename,
    size: report.size,
    chars: report.chars,
  };
}

function parseToolResult(output: string): ToolResultSchema | null {
  const value = parseJsonObject(output);
  if (!isToolResult(value)) return null;
  return value;
}

function parseJsonObject(value: string): unknown {
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function isToolResult(value: unknown): value is ToolResultSchema {
  if (!isRecord(value)) return false;
  return (
    (value.status === TOOL_RESULT_STATUS.SUCCESS || value.status === TOOL_RESULT_STATUS.ERROR)
    && isToolResultType(value.type)
    && typeof value.output === "string"
  );
}

function isToolResultType(value: unknown): value is ToolResultType {
  return typeof value === "string" && TOOL_RESULT_TYPE_SET.has(value);
}

function isReportToolResultOutput(value: unknown): value is ReportToolResultOutput {
  if (!isRecord(value)) return false;
  return (
    typeof value.report_id === "string"
    && value.report_id.length > 0
    && typeof value.filename === "string"
    && value.filename.length > 0
    && typeof value.size === "number"
    && Number.isFinite(value.size)
    && value.size >= 0
    && typeof value.chars === "number"
    && Number.isFinite(value.chars)
    && value.chars >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function maybeAttachmentToolResult(value: string): boolean {
  if (!maybeJsonObject(value)) return false;
  return TOOL_RESULT_ATTACHMENT_TYPE_PATTERN.test(value);
}

function maybeJsonObject(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === " " || char === "\n" || char === "\r" || char === "\t") continue;
    return char === "{";
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
