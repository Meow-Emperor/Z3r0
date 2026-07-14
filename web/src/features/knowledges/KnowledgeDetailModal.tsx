import { Empty, Spin, Tag } from "@douyinfe/semi-ui";
import { Braces, FileText } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { getKnowledgeDocument, getKnowledgeVector } from "../../shared/api/knowledges";
import { showApiError } from "../../shared/api/feedback";
import type { KnowledgeDocumentDetail, KnowledgeVectorDetail } from "../../shared/api/types";
import { AppModal } from "../../shared/components/AppModal";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { formatDateTime } from "../../shared/lib/date";
import { KNOWLEDGE_STATUS_COLORS } from "./knowledgeUi";

const CodeEditor = lazy(() => import("../container-shell/CodeEditor").then((module) => ({
  default: module.CodeEditor,
})));

export type KnowledgeDetailTarget =
  | { kind: "document"; id: string; label: string }
  | { kind: "vector"; id: string; label: string };

type KnowledgeDetail =
  | { kind: "document"; data: KnowledgeDocumentDetail }
  | { kind: "vector"; data: KnowledgeVectorDetail };

export function KnowledgeDetailModal({
  target,
  onClose,
}: {
  target: KnowledgeDetailTarget | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (!target) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    void (async () => {
      try {
        if (target.kind === "document") {
          const response = await getKnowledgeDocument(target.id);
          if (!response.data) throw new Error("document details are unavailable");
          if (!cancelled) setDetail({ kind: "document", data: response.data });
        } else {
          const response = await getKnowledgeVector(target.id);
          if (!response.data) throw new Error("vector details are unavailable");
          if (!cancelled) setDetail({ kind: "vector", data: response.data });
        }
      } catch (error) {
        if (!cancelled) showApiError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [target]);

  return (
    <AppModal
      open={target !== null}
      title={target?.kind === "vector" ? "Vector Details" : "Document Details"}
      titleIcon={target?.kind === "vector" ? <Braces size={17} /> : <FileText size={17} />}
      titleDescription={target?.label}
      width="min(1120px, calc(100vw - 24px))"
      onCancel={onClose}
    >
      <AsyncContent
        loading={loading}
        empty={detail === null}
        emptyIcon={target?.kind === "vector" ? <Braces size={42} /> : <FileText size={42} />}
        emptyTitle="Details are unavailable"
        wrapperClassName="knowledge-detail-spin"
      >
        {detail?.kind === "document" ? <DocumentDetail detail={detail.data} /> : null}
        {detail?.kind === "vector" ? <VectorDetail detail={detail.data} /> : null}
      </AsyncContent>
    </AppModal>
  );
}

function DocumentDetail({ detail }: { detail: KnowledgeDocumentDetail }) {
  return (
    <div className="knowledge-detail-content">
      <section className="knowledge-detail-facts" aria-label="Document metadata">
        <DetailFact label="Status">
          <Tag color={KNOWLEDGE_STATUS_COLORS[detail.status]}>{detail.status}</Tag>
        </DetailFact>
        <DetailFact label="Content">{detail.content_length.toLocaleString()} chars</DetailFact>
        <DetailFact label="Chunks">{detail.chunks_count.toLocaleString()}</DetailFact>
        <DetailFact label="Created">{formatDateTime(detail.created_at)}</DetailFact>
        <DetailFact label="Updated">{formatDateTime(detail.updated_at)}</DetailFact>
        <DetailFact label="Parser">{detail.parse_engine || detail.parse_format || "-"}</DetailFact>
      </section>

      <section className="knowledge-detail-identifiers" aria-label="Document identifiers">
        <DetailIdentifier label="Document ID" value={detail.id} />
        <DetailIdentifier label="Track ID" value={detail.track_id || "-"} />
        <DetailIdentifier label="Content Hash" value={detail.content_hash || "-"} />
      </section>

      <DetailSection title="Content Summary">
        <pre className="knowledge-detail-text">{detail.content_summary || "No summary is available."}</pre>
      </DetailSection>

      <DetailSection title="Extracted Document Content">
        {detail.content ? (
          <Editor value={detail.content} filename={detail.file_name} />
        ) : (
          <DetailEmpty icon={<FileText size={36} />} title="No extracted content is available" />
        )}
      </DetailSection>

      {detail.error ? (
        <DetailSection title="Processing Error">
          <pre className="knowledge-detail-text is-error">{detail.error}</pre>
        </DetailSection>
      ) : null}

      <DetailJsonSection title="Chunk IDs" value={detail.chunk_ids} />
      <DetailJsonSection title="Document Metadata" value={detail.metadata} />
      <DetailJsonSection title="Chunking Options" value={detail.chunk_options} />
    </div>
  );
}

function VectorDetail({ detail }: { detail: KnowledgeVectorDetail }) {
  return (
    <div className="knowledge-detail-content">
      <section className="knowledge-detail-facts" aria-label="Vector metadata">
        <DetailFact label="Chunk Index">{detail.chunk_index.toLocaleString()}</DetailFact>
        <DetailFact label="Tokens">{detail.tokens.toLocaleString()}</DetailFact>
        <DetailFact label="Dimensions">{detail.dimension.toLocaleString()}</DetailFact>
        <DetailFact label="Created">{formatDateTime(detail.created_at)}</DetailFact>
        <DetailFact label="Updated">{formatDateTime(detail.updated_at)}</DetailFact>
      </section>

      <section className="knowledge-detail-identifiers" aria-label="Vector identifiers">
        <DetailIdentifier label="Chunk ID" value={detail.id} />
        <DetailIdentifier label="Document ID" value={detail.document_id} />
        <DetailIdentifier label="Source Document" value={detail.file_name} />
      </section>

      <DetailSection title="Chunk Content">
        {detail.content ? (
          <Editor value={detail.content} filename={detail.file_name} compact />
        ) : (
          <DetailEmpty icon={<Braces size={36} />} title="This chunk has no text content" />
        )}
      </DetailSection>

      <DetailJsonSection title="Heading" value={detail.heading} />
      <DetailJsonSection title="Source Metadata" value={detail.source_metadata} />
    </div>
  );
}

function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function DetailIdentifier({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="knowledge-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailJsonSection({ title, value }: { title: string; value: unknown[] | Record<string, unknown> }) {
  const hasContent = Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
  if (!hasContent) return null;
  return (
    <DetailSection title={title}>
      <pre className="knowledge-detail-json">{JSON.stringify(value, null, 2)}</pre>
    </DetailSection>
  );
}

function DetailEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return <Empty className="knowledge-detail-empty" image={icon} title={title} description="" />;
}

function Editor({ value, filename, compact = false }: { value: string; filename: string; compact?: boolean }) {
  return (
    <div className={`knowledge-detail-editor${compact ? " is-compact" : ""}`}>
      <Suspense fallback={<Spin spinning />}>
        <CodeEditor value={value} readOnly filename={filename} />
      </Suspense>
    </div>
  );
}
