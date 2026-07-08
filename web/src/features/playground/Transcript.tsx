import { AlertOctagon, Brain, ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AgentTranscript,
  ErrorItem,
  ReportAttachmentItem,
  ThinkingItem,
  TranscriptAttachmentItem,
} from "./chatState";
import { downloadAgentReport } from "../../shared/api/agentSessions";
import { showApiError } from "../../shared/api/feedback";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { normalizeMarkdownForRender } from "./markdown";
import type { SubagentSelection } from "./subagentView";
import { cx } from "../../shared/lib/className";
import { saveBlob } from "../../shared/lib/download";
import { formatBytes } from "../../shared/lib/number";
import { ToolGroup } from "./TranscriptExecutions";
import {
  activeTextItemId,
  activeThinkingItemId,
  buildTranscriptSegments,
  isTranscriptEmpty,
  type ContentBlock,
  type TranscriptRenderSegment,
} from "./transcriptView";

export function TranscriptContent({
  transcript,
  live,
  emptyText,
  pendingEmpty = false,
  allowSubagentOpen = true,
  selectedSubagent,
  onOpenSubagent,
}: {
  transcript: AgentTranscript;
  live: boolean;
  emptyText?: string;
  pendingEmpty?: boolean;
  allowSubagentOpen?: boolean;
  selectedSubagent?: SubagentSelection | null;
  onOpenSubagent?: (selection: SubagentSelection) => void;
}) {
  const isEmpty = isTranscriptEmpty(transcript);
  const activeTextId = live ? activeTextItemId(transcript.blocks) : "";
  const activeThinkingId = live ? activeThinkingItemId(transcript.blocks) : "";
  const segments = useMemo(() => buildTranscriptSegments(transcript.blocks), [transcript.blocks]);
  const attachments = transcript.attachments ?? [];

  return (
    <div className="transcript-body">
      {pendingEmpty && isEmpty && live ? <PendingShimmer /> : null}
      {segments.map((segment) => (
        <TranscriptSegmentView
          key={segment.id}
          segment={segment}
          live={live}
          activeTextId={activeTextId}
          activeThinkingId={activeThinkingId}
          allowSubagentOpen={allowSubagentOpen}
          selectedSubagent={selectedSubagent}
          onOpenSubagent={onOpenSubagent}
        />
      ))}
      {attachments.length ? <TranscriptAttachments attachments={attachments} /> : null}
      {live && !isEmpty ? <span className="caret" /> : null}
      {isEmpty && emptyText ? <div className="transcript-empty">{emptyText}</div> : null}
    </div>
  );
}

function TranscriptSegmentView({
  segment,
  live,
  activeTextId,
  activeThinkingId,
  allowSubagentOpen,
  selectedSubagent,
  onOpenSubagent,
}: {
  segment: TranscriptRenderSegment;
  live: boolean;
  activeTextId: string;
  activeThinkingId: string;
  allowSubagentOpen: boolean;
  selectedSubagent?: SubagentSelection | null;
  onOpenSubagent?: (selection: SubagentSelection) => void;
}) {
  if (segment.kind === "thinking") {
    return (
      <ThinkingGroup
        items={segment.items}
        activeItemId={activeThinkingId}
        active={segment.items.some((item) => item.id === activeThinkingId && !item.complete)}
        live={live}
      />
    );
  }
  if (segment.kind === "tools") {
    return (
      <ToolGroup
        items={segment.items}
        live={live}
        selectedSubagent={selectedSubagent}
        onOpenSubagent={onOpenSubagent}
        allowSubagentOpen={allowSubagentOpen}
        header={(props) => <PanelHeader {...props} />}
      />
    );
  }
  return (
    <ContentBlockView
      block={segment.block}
      streaming={segment.block.kind === "text" ? segment.block.id === activeTextId && !segment.block.complete : false}
    />
  );
}

function ContentBlockView({ block, streaming }: { block: ContentBlock; streaming: boolean }) {
  switch (block.kind) {
    case "text":
      return <MarkdownText text={block.text} streaming={streaming} />;
    case "error":
      return <ErrorNotice item={block} />;
  }
}

const STREAM_RENDER_INTERVAL_MS = 80;

const MarkdownText = memo(function MarkdownText({ text, streaming }: { text: string; streaming: boolean }) {
  const [renderText, setRenderText] = useState(text);
  const latestTextRef = useRef(text);

  latestTextRef.current = text;

  useEffect(() => {
    if (!streaming) {
      setRenderText(text);
      return;
    }
    const timer = setInterval(() => {
      setRenderText(latestTextRef.current);
    }, STREAM_RENDER_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      setRenderText(latestTextRef.current);
    };
  }, [streaming, text === ""]);

  useEffect(() => {
    if (!streaming) setRenderText(text);
  }, [streaming, text]);

  const markdown = useMemo(
    () => normalizeMarkdownForRender(renderText, streaming),
    [renderText, streaming],
  );
  if (!renderText && !streaming) return null;
  return (
    <div className="agent-text">
      <MarkdownRenderer markdown={markdown} />
    </div>
  );
});

function ThinkingGroup({
  items,
  active,
  activeItemId,
  live,
}: {
  items: ThinkingItem[];
  active: boolean;
  activeItemId: string;
  live: boolean;
}) {
  const [open, setOpen] = useState(active);
  const wasActive = useRef(active);
  const bodyRef = useRef<HTMLPreElement | null>(null);
  const text = useMemo(
    () => items.map((item) => item.text.trim()).filter(Boolean).join("\n\n"),
    [items],
  );

  useEffect(() => {
    if (active) {
      setOpen(true);
    } else if (wasActive.current) {
      setOpen(false);
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, open]);

  return (
    <div className={cx("thinking-block", live && "transcript-panel-live", active && "thinking-block-active")}>
      <PanelHeader
        icon={<Brain size={13} />}
        title={active ? "Thinking..." : "Thought"}
        count={items.length > 1 ? items.length : undefined}
        open={open}
        onToggle={() => setOpen((next) => !next)}
      />
      {open ? (
        <div className="thinking-body">
          <div className="thinking-fade thinking-fade-top" />
          <pre ref={bodyRef} className="thinking-text">
            {text || (activeItemId ? " " : "(empty)")}
          </pre>
          <div className="thinking-fade thinking-fade-bottom" />
        </div>
      ) : null}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  count,
  open,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="transcript-panel-header" onClick={onToggle}>
      {icon}
      <span>{title}</span>
      {count ? <span className="transcript-panel-count">{count}</span> : null}
      <span className="transcript-panel-toggle">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
    </button>
  );
}

function ErrorNotice({ item }: { item: ErrorItem }) {
  return (
    <div className="agent-error">
      <AlertOctagon size={16} />
      <span>{item.message}</span>
    </div>
  );
}

type TranscriptAttachmentRenderContext = {
  downloadingReportId: string;
  onDownloadReport: (report: ReportAttachmentItem) => void;
};

const TRANSCRIPT_ATTACHMENT_RENDERERS: {
  [Kind in TranscriptAttachmentItem["kind"]]: (
    attachment: Extract<TranscriptAttachmentItem, { kind: Kind }>,
    context: TranscriptAttachmentRenderContext,
  ) => ReactNode;
} = {
  report: (attachment, context) => (
    <ReportAttachment
      report={attachment}
      disabled={Boolean(context.downloadingReportId)}
      onDownload={() => context.onDownloadReport(attachment)}
    />
  ),
};

function TranscriptAttachments({ attachments }: { attachments: TranscriptAttachmentItem[] }) {
  const [downloadingReportId, setDownloadingReportId] = useState("");
  const downloadReport = useCallback(async (report: ReportAttachmentItem) => {
    if (downloadingReportId) return;
    setDownloadingReportId(report.reportId);
    try {
      const { blob, filename } = await downloadAgentReport(report.reportId);
      saveBlob(blob, filename || report.filename);
    } catch (error) {
      showApiError(error);
    } finally {
      setDownloadingReportId((current) => (current === report.reportId ? "" : current));
    }
  }, [downloadingReportId]);
  const context = useMemo(
    () => ({ downloadingReportId, onDownloadReport: downloadReport }),
    [downloadReport, downloadingReportId],
  );

  return (
    <div className="transcript-attachments">
      {attachments.map((attachment) => (
        <TranscriptAttachment
          key={attachment.id}
          attachment={attachment}
          context={context}
        />
      ))}
    </div>
  );
}

function TranscriptAttachment({
  attachment,
  context,
}: {
  attachment: TranscriptAttachmentItem;
  context: TranscriptAttachmentRenderContext;
}) {
  const render = TRANSCRIPT_ATTACHMENT_RENDERERS[attachment.kind] as (
    attachment: TranscriptAttachmentItem,
    context: TranscriptAttachmentRenderContext,
  ) => ReactNode;
  return render(attachment, context);
}

function ReportAttachment({
  report,
  disabled,
  onDownload,
}: {
  report: ReportAttachmentItem;
  disabled: boolean;
  onDownload: () => void;
}) {
  return (
    <button
      type="button"
      className="report-attachment"
      disabled={disabled}
      title={`${report.filename} · ${formatBytes(report.size)}`}
      aria-label={`Download ${report.filename}`}
      onClick={onDownload}
    >
      <span className="report-attachment-icon">
        <FileText size={18} />
      </span>
      <span className="report-attachment-main">
        <span className="report-attachment-name">{report.filename}</span>
        <span className="report-attachment-size">{formatBytes(report.size)}</span>
      </span>
      <span className="report-attachment-download">
        <Download size={14} />
      </span>
    </button>
  );
}

function PendingShimmer() {
  return (
    <div className="agent-pending">
      <span /><span /><span />
    </div>
  );
}
