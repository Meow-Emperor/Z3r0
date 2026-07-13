import { Button, Popconfirm, Select, TabPane, Tabs, Tag, Toast, Tooltip } from "@douyinfe/semi-ui";
import { Braces, DatabaseZap, Eye, FileText, Network, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  deleteKnowledgeDocument,
  getKnowledgeGraph,
  queryKnowledgeDocuments,
  queryKnowledgeVectors,
  searchKnowledgeGraph,
  uploadKnowledgeDocuments,
} from "../../shared/api/knowledges";
import { showApiError } from "../../shared/api/feedback";
import {
  KNOWLEDGE_DOCUMENT_STATUSES,
  KNOWLEDGE_GRAPH_EXPANSION_NODES,
  KNOWLEDGE_GRAPH_MAX_NODES,
} from "../../shared/api/generated/constants";
import type {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeGraph,
  KnowledgeVector,
  QueryKnowledgeDocumentsData,
} from "../../shared/api/types";
import { ResourceIdentity, ResourceText, RowActions } from "../../shared/components/ResourceCells";
import {
  MetricStrip,
  ResourcePager,
  ResourcePanel,
  ResourceSearchForm,
} from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { formatDateTime } from "../../shared/lib/date";
import { UI_TEXT } from "../../shared/lib/uiText";
import { KnowledgeDetailModal, type KnowledgeDetailTarget } from "./KnowledgeDetailModal";
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { KNOWLEDGE_STATUS_COLORS } from "./knowledgeUi";

type KnowledgeTab = "documents" | "vectors" | "graph";

const EMPTY_GRAPH: KnowledgeGraph = { nodes: [], edges: [], is_truncated: false };
const DOCUMENT_POLL_INTERVAL_MS = 5_000;
const INFLIGHT_DOCUMENT_STATUSES: KnowledgeDocumentStatus[] = [
  "pending",
  "parsing",
  "analyzing",
  "processing",
  "preprocessed",
];
function countInflightDocuments(counts: Record<string, number>) {
  return INFLIGHT_DOCUMENT_STATUSES.reduce(
    (total, documentStatus) => total + (counts[documentStatus] ?? 0),
    0,
  );
}

export function KnowledgesPage() {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("documents");
  const [status, setStatus] = useState<KnowledgeDocumentStatus | undefined>();
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [graph, setGraph] = useState<KnowledgeGraph>(EMPTY_GRAPH);
  const [graphQuery, setGraphQuery] = useState("");
  const [activeGraphQuery, setActiveGraphQuery] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphExpansionLimits, setGraphExpansionLimits] = useState<Record<string, number>>({});
  const [expandedGraphNodeIds, setExpandedGraphNodeIds] = useState<Set<string>>(new Set());
  const [expandingGraphNodeIds, setExpandingGraphNodeIds] = useState<Set<string>>(new Set());
  const [awaitingUploadCompletion, setAwaitingUploadCompletion] = useState(false);
  const [processingCompletionVersion, setProcessingCompletionVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<KnowledgeDetailTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const graphRequestRef = useRef(0);
  const graphExpansionRequestsRef = useRef<Set<string>>(new Set());
  const latestInflightDocumentsRef = useRef(0);
  const documentDataVersionRef = useRef(0);
  const handledProcessingCompletionVersionRef = useRef(0);

  const queryDocumentPage = useCallback(
    ({ page, size }: { page: number; size: number }) => queryKnowledgeDocuments({ page, size, status }),
    [status],
  );
  const updateDocumentMetrics = useCallback((data: QueryKnowledgeDocumentsData | null) => {
    if (!data) return;
    const counts = data.status_counts;
    const nextInflightDocuments = countInflightDocuments(counts);
    if (latestInflightDocumentsRef.current > 0 && nextInflightDocuments === 0) {
      setProcessingCompletionVersion((current) => current + 1);
    }
    latestInflightDocumentsRef.current = nextInflightDocuments;
    documentDataVersionRef.current += 1;
    setStatusCounts(counts);
  }, []);
  const documents = usePagedResourceList<KnowledgeDocument, QueryKnowledgeDocumentsData>({
    query: queryDocumentPage,
    onData: updateDocumentMetrics,
  });
  const queryVectorPage = useCallback(
    ({ page, size }: { page: number; size: number }) => queryKnowledgeVectors({ page, size }),
    [],
  );
  const vectors = usePagedResourceList<KnowledgeVector>({
    query: queryVectorPage,
  });
  const inflightDocuments = countInflightDocuments(statusCounts);

  useEffect(() => () => {
    graphRequestRef.current += 1;
    graphExpansionRequestsRef.current.clear();
  }, []);

  const loadGraph = useCallback(async (query = activeGraphQuery) => {
    const normalizedQuery = query.trim();
    const requestId = graphRequestRef.current + 1;
    graphRequestRef.current = requestId;
    graphExpansionRequestsRef.current.clear();
    setExpandingGraphNodeIds(new Set());
    if (!normalizedQuery) {
      setGraphLoading(false);
      setGraph(EMPTY_GRAPH);
      setGraphExpansionLimits({});
      setExpandedGraphNodeIds(new Set());
      setExpandingGraphNodeIds(new Set());
      return;
    }
    setGraphLoading(true);
    try {
      const response = await searchKnowledgeGraph({
        query: normalizedQuery,
        max_nodes: KNOWLEDGE_GRAPH_MAX_NODES,
      });
      if (graphRequestRef.current === requestId) {
        setGraph(response.data ?? EMPTY_GRAPH);
        setGraphExpansionLimits({});
        setExpandedGraphNodeIds(new Set());
        setExpandingGraphNodeIds(new Set());
      }
    } catch (error) {
      if (graphRequestRef.current === requestId) showApiError(error);
    } finally {
      if (graphRequestRef.current === requestId) setGraphLoading(false);
    }
  }, [activeGraphQuery]);

  useEffect(() => {
    if (inflightDocuments === 0 && !awaitingUploadCompletion) return;
    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        const previousDataVersion = documentDataVersionRef.current;
        const previousInflightDocuments = latestInflightDocumentsRef.current;
        await documents.loadItems();
        if (cancelled) return;
        if (documentDataVersionRef.current === previousDataVersion) {
          schedule();
          return;
        }
        if (latestInflightDocumentsRef.current === 0) {
          setAwaitingUploadCompletion(false);
          if (previousInflightDocuments === 0) {
            await Promise.all([vectors.loadItems(), loadGraph()]);
          }
          return;
        }
        schedule();
      }, DOCUMENT_POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [awaitingUploadCompletion, documents.loadItems, inflightDocuments, loadGraph, vectors.loadItems]);

  useEffect(() => {
    if (processingCompletionVersion <= handledProcessingCompletionVersionRef.current) return;
    handledProcessingCompletionVersionRef.current = processingCompletionVersion;
    void Promise.all([vectors.loadItems(), loadGraph()]);
  }, [loadGraph, processingCompletionVersion, vectors.loadItems]);

  const expandGraphNode = useCallback(async (node: KnowledgeGraph["nodes"][number]) => {
    if (
      graphExpansionRequestsRef.current.has(node.id)
      || expandedGraphNodeIds.has(node.id)
      || graph.nodes.length >= KNOWLEDGE_GRAPH_MAX_NODES
    ) return;

    const previousLimit = graphExpansionLimits[node.id] ?? 0;
    const nextLimit = Math.min(
      previousLimit + KNOWLEDGE_GRAPH_EXPANSION_NODES,
      KNOWLEDGE_GRAPH_MAX_NODES,
    );
    const graphRequestId = graphRequestRef.current;
    graphExpansionRequestsRef.current.add(node.id);
    setExpandingGraphNodeIds((current) => new Set(current).add(node.id));
    try {
      const response = await getKnowledgeGraph({
        query: node.labels[0] || node.id,
        max_depth: 1,
        max_nodes: nextLimit,
      });
      if (graphRequestRef.current !== graphRequestId) return;

      const incoming = response.data ?? EMPTY_GRAPH;
      setGraph((current) => mergeKnowledgeGraphs(current, incoming, KNOWLEDGE_GRAPH_MAX_NODES));
      setGraphExpansionLimits((current) => ({ ...current, [node.id]: nextLimit }));
      if (!incoming.is_truncated || nextLimit >= KNOWLEDGE_GRAPH_MAX_NODES) {
        setExpandedGraphNodeIds((current) => new Set(current).add(node.id));
      }
    } catch (error) {
      if (graphRequestRef.current === graphRequestId) showApiError(error);
    } finally {
      if (graphRequestRef.current === graphRequestId) {
        graphExpansionRequestsRef.current.delete(node.id);
        setExpandingGraphNodeIds((current) => {
          const next = new Set(current);
          next.delete(node.id);
          return next;
        });
      }
    }
  }, [expandedGraphNodeIds, graph.nodes.length, graphExpansionLimits]);

  const refreshKnowledgeData = useCallback(async () => {
    await Promise.all([
      documents.loadItems(),
      vectors.loadItems(),
      loadGraph(),
    ]);
  }, [documents.loadItems, loadGraph, vectors.loadItems]);
  const { run: deleteDocument, busyId: deletingDocumentId } = useResourceAction<KnowledgeDocument>(
    (document) => deleteKnowledgeDocument(document.id),
    refreshKnowledgeData,
  );

  const refreshActive = useCallback(async () => {
    if (activeTab === "documents") await documents.loadItems();
    if (activeTab === "vectors") await vectors.loadItems();
    if (activeTab === "graph") await loadGraph();
  }, [activeTab, documents.loadItems, loadGraph, vectors.loadItems]);

  const handleTabChange = (key: string) => {
    const next = key as KnowledgeTab;
    setActiveTab(next);
    if (next === "vectors") void vectors.loadItems();
    if (next === "graph") void loadGraph();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    try {
      const response = await uploadKnowledgeDocuments(files);
      const result = response.data;
      if (!result) throw new Error("upload response did not include a batch result");

      const queued = result.queued_files.length;
      if (queued > 0) {
        Toast.success(`${queued} document${queued === 1 ? "" : "s"} queued`);
        setAwaitingUploadCompletion(true);
        setActiveTab("documents");
        if (documents.page === 1) await documents.loadItems();
        else documents.goToFirstPage();
      }
      result.rejected_files.forEach((rejected) => {
        showApiError(new Error(`${rejected.file_name}: ${rejected.message}`));
      });
    } catch (error) {
      showApiError(error);
    } finally {
      setUploading(false);
    }
  };

  const activeLoading = uploading
    || deletingDocumentId !== null
    || (activeTab === "documents" && documents.loading)
    || (activeTab === "vectors" && vectors.loading)
    || (activeTab === "graph" && graphLoading);

  useAdminResourceHeader({
    createLabel: "Upload Documents",
    createIcon: <Upload size={16} />,
    refreshLabel: "Refresh knowledges",
    loading: activeLoading,
    onCreate: () => fileInputRef.current?.click(),
    onRefresh: refreshActive,
  });

  const metrics = useMemo(() => [
    { label: "Documents", value: statusCounts.all ?? documents.total },
    { label: "Processed", value: statusCounts.processed ?? 0 },
    { label: "Vectors", value: vectors.total },
    { label: "Visible Graph", value: `${graph.nodes.length} / ${graph.edges.length}` },
  ], [documents.total, graph.edges.length, graph.nodes.length, statusCounts, vectors.total]);

  return (
    <section className="knowledges-page">
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept=".md,.pdf"
        multiple
        onChange={(event) => void handleUpload(event)}
      />
      <MetricStrip metrics={metrics} />
      <Tabs type="line" activeKey={activeTab} onChange={handleTabChange} className="knowledge-tabs">
        <TabPane itemKey="documents" tab={<TabLabel icon={<FileText size={15} />} text="Documents" />}>
          <DocumentsTab
            items={documents.items}
            status={status}
            loading={documents.loading || uploading || deletingDocumentId !== null}
            deletingId={deletingDocumentId}
            page={documents.page}
            rangeStart={documents.rangeStart}
            rangeEnd={documents.rangeEnd}
            total={documents.total}
            canGoBack={documents.canGoBack}
            canGoNext={documents.canGoNext}
            onStatus={(next) => {
              setStatus(next);
              documents.goToFirstPage();
            }}
            onPrevious={documents.previous}
            onNext={documents.next}
            onView={(document) => setDetailTarget({
              kind: "document",
              id: document.id,
              label: document.file_name,
            })}
            onDelete={deleteDocument}
          />
        </TabPane>
        <TabPane itemKey="vectors" tab={<TabLabel icon={<Braces size={15} />} text="Vectors" />}>
          <VectorsTab
            vectors={vectors}
            onView={(vector) => setDetailTarget({
              kind: "vector",
              id: vector.id,
              label: vector.file_name,
            })}
          />
        </TabPane>
        <TabPane itemKey="graph" tab={<TabLabel icon={<Network size={15} />} text="Knowledge Graph" />}>
          <ResourcePanel
            className="knowledge-graph-panel"
            toolbar={(
              <ResourceSearchForm
                value={graphQuery}
                placeholder="Search entities and relationships"
                onChange={setGraphQuery}
                onSearch={() => {
                  const query = graphQuery.trim();
                  setActiveGraphQuery(query);
                  void loadGraph(query);
                }}
              />
            )}
            empty={graph.nodes.length === 0}
            emptyTitle={activeGraphQuery ? "No graph results found" : "No graph loaded"}
            emptyIcon={<Network size={42} />}
          >
            <KnowledgeGraphView
              graph={graph}
              expansionLimits={graphExpansionLimits}
              expandedNodeIds={expandedGraphNodeIds}
              expandingNodeIds={expandingGraphNodeIds}
              nodeLimitReached={graph.nodes.length >= KNOWLEDGE_GRAPH_MAX_NODES}
              onExpand={expandGraphNode}
            />
          </ResourcePanel>
        </TabPane>
      </Tabs>
      <KnowledgeDetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
    </section>
  );
}

function mergeKnowledgeGraphs(current: KnowledgeGraph, incoming: KnowledgeGraph, maxNodes: number): KnowledgeGraph {
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));
  let isTruncated = current.is_truncated || incoming.is_truncated;
  incoming.nodes.forEach((node) => {
    const existing = nodes.get(node.id);
    if (existing) {
      nodes.set(node.id, {
        ...existing,
        labels: node.labels.length > 0 ? node.labels : existing.labels,
        properties: { ...existing.properties, ...node.properties },
      });
      return;
    }
    if (nodes.size >= maxNodes) {
      isTruncated = true;
      return;
    }
    nodes.set(node.id, node);
  });

  const nodeIds = new Set(nodes.keys());
  const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
  incoming.edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edges.set(edge.id, edge);
  });
  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    is_truncated: isTruncated,
  };
}

type PageProps = {
  page: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  canGoBack: boolean;
  canGoNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function DocumentsTab({ items, status, deletingId, onStatus, onView, onDelete, ...page }: PageProps & {
  items: KnowledgeDocument[];
  status?: KnowledgeDocumentStatus;
  deletingId: string | null;
  onStatus: (status?: KnowledgeDocumentStatus) => void;
  onView: (document: KnowledgeDocument) => void;
  onDelete: (document: KnowledgeDocument) => Promise<void>;
}) {
  const columns: ResourceColumn<KnowledgeDocument>[] = [
    { key: "document", header: "Document", width: "minmax(260px, 1fr)", render: (item) => <ResourceIdentity icon={<FileText size={18} />} title={item.file_name} detail={item.content_summary || item.id} /> },
    { key: "status", header: "Status", width: "120px", render: (item) => <Tag color={KNOWLEDGE_STATUS_COLORS[item.status]}>{item.status}</Tag> },
    { key: "size", header: "Content", width: "150px", render: (item) => <ResourceText>{item.content_length.toLocaleString()} chars</ResourceText> },
    { key: "chunks", header: "Chunks", width: "90px", render: (item) => item.chunks_count },
    { key: "updated", header: "Updated", width: "170px", render: (item) => formatDateTime(item.updated_at) },
    {
      key: "actions", header: "Actions", width: "104px",
      render: (item) => (
        <RowActions>
          <Tooltip content="View document details">
            <Button
              icon={<Eye size={15} />}
              theme="borderless"
              type="tertiary"
              aria-label={`View details for ${item.file_name}`}
              onClick={() => onView(item)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete document"
            content={`Delete ${item.file_name} and all indexed vectors and graph data?`}
            okType="danger"
            cancelText={UI_TEXT.cancel}
            onConfirm={() => void onDelete(item)}
          >
            <Button
              icon={<Trash2 size={15} />}
              theme="borderless"
              type="danger"
              loading={deletingId === item.id}
              aria-label={`Delete ${item.file_name}`}
            />
          </Popconfirm>
        </RowActions>
      ),
    },
  ];
  return (
    <ResourcePanel
      toolbar={(
        <Select
          value={status}
          placeholder="All statuses"
          showClear
          optionList={KNOWLEDGE_DOCUMENT_STATUSES.map((value) => ({ label: value, value }))}
          onChange={(value) => onStatus(value as KnowledgeDocumentStatus | undefined)}
        />
      )}
      loading={page.loading}
      empty={items.length === 0}
      emptyTitle="No documents found"
      emptyIcon={<FileText size={42} />}
      footer={<ResourcePager {...page} />}
    >
      <ResourceTable ariaLabel="Knowledge documents" columns={columns} rows={items} rowKey={(item) => item.id} />
    </ResourcePanel>
  );
}

function VectorsTab({
  vectors,
  onView,
}: {
  vectors: ReturnType<typeof usePagedResourceList<KnowledgeVector>>;
  onView: (vector: KnowledgeVector) => void;
}) {
  const columns: ResourceColumn<KnowledgeVector>[] = [
    { key: "vector", header: "Vector", width: "minmax(260px, 0.8fr)", render: (item) => <ResourceIdentity icon={<Braces size={18} />} title={item.file_name} detail={item.id} /> },
    { key: "content", header: "Chunk Content", width: "minmax(320px, 1.4fr)", render: (item) => <ResourceText>{item.content}</ResourceText> },
    { key: "index", header: "Index", width: "80px", render: (item) => item.chunk_index },
    { key: "tokens", header: "Tokens", width: "90px", render: (item) => item.tokens },
    { key: "dimension", header: "Dim", width: "80px", render: (item) => item.dimension },
    {
      key: "actions", header: "Actions", width: "64px",
      render: (item) => (
        <RowActions>
          <Tooltip content="View vector details">
            <Button
              icon={<Eye size={15} />}
              theme="borderless"
              type="tertiary"
              aria-label={`View vector details for ${item.file_name}`}
              onClick={() => onView(item)}
            />
          </Tooltip>
        </RowActions>
      ),
    },
  ];
  return (
    <ResourcePanel
      loading={vectors.loading}
      empty={vectors.items.length === 0}
      emptyTitle="No vectors found"
      emptyIcon={<DatabaseZap size={42} />}
      footer={(
        <ResourcePager
          page={vectors.page}
          rangeStart={vectors.rangeStart}
          rangeEnd={vectors.rangeEnd}
          total={vectors.total}
          loading={vectors.loading}
          canGoBack={vectors.canGoBack}
          canGoNext={vectors.canGoNext}
          onPrevious={vectors.previous}
          onNext={vectors.next}
        />
      )}
    >
      <ResourceTable ariaLabel="Knowledge vectors" columns={columns} rows={vectors.items} rowKey={(item) => item.id} />
    </ResourcePanel>
  );
}

function TabLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return <span className="workspace-tab-label">{icon}{text}</span>;
}
