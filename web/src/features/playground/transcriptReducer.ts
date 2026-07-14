import type { AgentContentEvent, SubagentTaskEvent } from "../../shared/api/types";
import { AGENT_EVENT_TYPE } from "../../shared/api/generated/constants";
import { createClientId } from "../../shared/lib/id";
import {
  findCompletedTextIndex,
  findStreamingBlockIndex,
  findToolBlockIndex,
  hasCoveredCompletedText,
} from "./transcriptIdentity";
import { attachmentFromToolResult, transcriptAttachmentIdentity } from "./toolResultAttachments";
import type {
  AgentTranscript,
  StreamingItem,
  SubagentExecutionItem,
  ToolExecutionItem,
  TranscriptAttachmentItem,
  TranscriptBlock,
} from "./transcriptTypes";

export function applyEventToTranscript(transcript: AgentTranscript, event: AgentContentEvent): boolean {
  switch (event.type) {
    case AGENT_EVENT_TYPE.USER_MESSAGE:
    case AGENT_EVENT_TYPE.TURN_BOUNDARY:
      return false;
    case AGENT_EVENT_TYPE.THINKING_DELTA:
      setAgentName(transcript, event.agent_name);
      upsertStreamingBlock(transcript.blocks, "thinking", event.segment_id, { text: event.text });
      return false;
    case AGENT_EVENT_TYPE.THINKING_COMPLETE:
      setAgentName(transcript, event.agent_name);
      upsertStreamingBlock(transcript.blocks, "thinking", event.segment_id, { text: event.text, complete: true });
      return false;
    case AGENT_EVENT_TYPE.TEXT_DELTA:
      setAgentName(transcript, event.agent_name);
      upsertStreamingBlock(transcript.blocks, "text", event.segment_id, { text: event.text });
      return false;
    case AGENT_EVENT_TYPE.TEXT_COMPLETE:
      setAgentName(transcript, event.agent_name);
      upsertStreamingBlock(transcript.blocks, "text", event.segment_id, { text: event.text, complete: true });
      return false;
    case AGENT_EVENT_TYPE.TOOL_CALL:
      setAgentName(transcript, event.agent_name);
      upsertToolCall(transcript.blocks, event.call_id, event.name, event.arguments ?? {});
      return false;
    case AGENT_EVENT_TYPE.TOOL_RESULT:
      setAgentName(transcript, event.agent_name);
      upsertToolResult(transcript.blocks, event.call_id, event.output, event.is_error);
      upsertTranscriptAttachment(
        transcript.attachments,
        attachmentFromToolResult(event),
      );
      return false;
    case AGENT_EVENT_TYPE.SUBAGENT_TASK:
      setAgentName(transcript, event.agent_name);
      upsertSubagentTask(transcript.blocks, subagentExecutionItemFromEvent(event));
      return false;
    case AGENT_EVENT_TYPE.ERROR:
      setAgentName(transcript, event.agent_name);
      transcript.blocks.push({ kind: "error", id: `error:${event.seq}:${event.created_at}`, message: event.message || "agent run failed" });
      return true;
  }
}

export function createTranscript(createdAt: AgentContentEvent["created_at"] | "" = ""): AgentTranscript {
  return { createdAt, agentName: "", blocks: [], attachments: [] };
}

export function cloneTranscript(transcript: AgentTranscript): AgentTranscript {
  return {
    createdAt: transcript.createdAt,
    agentName: transcript.agentName,
    blocks: transcript.blocks.slice(),
    attachments: transcript.attachments?.slice() ?? [],
  };
}

function setAgentName(transcript: AgentTranscript, name: string) {
  if (name && !transcript.agentName) transcript.agentName = name;
}

function upsertStreamingBlock(
  blocks: TranscriptBlock[],
  kind: StreamingItem["kind"],
  segmentId: string,
  patch: { text: string; complete?: boolean },
) {
  const index = findStreamingBlockIndex(blocks, kind, segmentId);
  if (index === -1) {
    if (hasCoveredCompletedText(blocks, kind, patch.text)) return;
    blocks.push({ kind, id: `${kind}:${segmentId}`, segmentId, text: patch.text, complete: Boolean(patch.complete) } as StreamingItem);
    return;
  }
  const existing = blocks[index] as StreamingItem;
  const duplicateIndex = findCompletedTextIndex(blocks, kind, patch.text, index);
  if (duplicateIndex !== -1) {
    blocks.splice(index, 1);
    return;
  }
  if (existing.complete && existing.text === patch.text) return;
  blocks[index] = {
    ...existing,
    text: patch.text,
    complete: patch.complete ?? existing.complete,
  };
}

function upsertToolCall(blocks: TranscriptBlock[], callId: string, name: string, argumentsValue: Record<string, unknown>) {
  // A nameless tool call is not renderable; drop it so it never reaches the UI.
  if (!name) return;
  const index = findToolBlockIndex(blocks, callId, name, argumentsValue);
  if (index === -1) {
    blocks.push({ kind: "tool", id: callId || createClientId("transcript"), callId, name, arguments: argumentsValue, output: "", isError: false, resolved: false });
    return;
  }
  const existing = blocks[index] as ToolExecutionItem;
  blocks[index] = { ...existing, callId: existing.callId || callId, name, arguments: argumentsValue };
}

function upsertToolResult(
  blocks: TranscriptBlock[],
  callId: string,
  output: string,
  isError: boolean,
): void {
  // Attach to its named tool call; never materialize an orphan (nameless) block.
  const index = findToolBlockIndex(blocks, callId);
  if (index === -1) return;
  const existing = blocks[index] as ToolExecutionItem;
  blocks[index] = { ...existing, output, isError, resolved: true };
}

function upsertTranscriptAttachment(
  attachments: TranscriptAttachmentItem[],
  nextItem: TranscriptAttachmentItem | null,
) {
  if (!nextItem) return;
  const nextIdentity = transcriptAttachmentIdentity(nextItem);
  const index = attachments.findIndex((item) =>
    transcriptAttachmentIdentity(item) === nextIdentity
    || (item.kind === nextItem.kind && item.callId !== "" && item.callId === nextItem.callId),
  );
  if (index === -1) {
    attachments.push(nextItem);
    return;
  }
  attachments[index] = nextItem;
}

function upsertSubagentTask(blocks: TranscriptBlock[], nextItem: SubagentExecutionItem) {
  const index = blocks.findIndex((block) => block.kind === "subagent" && block.runId === nextItem.runId);
  if (index === -1) {
    blocks.push(nextItem);
    return;
  }
  blocks[index] = nextItem;
}

export function subagentExecutionItemFromEvent(event: SubagentTaskEvent): SubagentExecutionItem {
  return {
    kind: "subagent",
    id: event.run_id,
    createdAt: event.created_at,
    runId: event.run_id,
    parentAgentCode: event.parent_agent_code,
    parentAgentInstanceId: event.parent_agent_instance_id,
    agentCode: event.agent_code,
    nestedCallId: event.nested_call_id,
    status: event.status,
    resultPreview: event.result_preview,
    errorPreview: event.error_preview,
    resultChars: event.result_chars,
    errorChars: event.error_chars,
    truncated: event.truncated,
    progress: event.progress,
  };
}
