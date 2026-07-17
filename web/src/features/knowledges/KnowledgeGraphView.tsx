import { Button } from "@douyinfe/semi-ui";
import cytoscape from "cytoscape";
import { Network, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KnowledgeGraph, KnowledgeGraphNode } from "../../shared/api/types";
import { CytoscapeGraph, type CytoscapeLayoutOptions } from "../../shared/components/CytoscapeGraph";

const FIT_PADDING = 52;

const GRAPH_STYLES: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "#42d6c5",
      "border-color": "#d6fff9",
      "border-width": 1.5,
      color: "#eaf6ff",
      label: "data(label)",
      "font-size": 10,
      "text-background-color": "#111820",
      "text-background-opacity": 0.86,
      "text-background-padding": "4px",
      "text-margin-y": -18,
      "text-wrap": "ellipsis",
      "text-max-width": "120px",
      "min-zoomed-font-size": 7,
      width: 14,
      height: 14,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.3,
      "line-color": "#7890a8",
      "target-arrow-color": "#7890a8",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.72,
    },
  },
  {
    selector: "node.knowledge-query-match",
    style: {
      "background-color": "#f5b942",
      "border-color": "#fff0b3",
      "border-width": 3,
      width: 20,
      height: 20,
    },
  },
  {
    selector: "node:selected",
    style: { "background-color": "#ff7d8a", "border-color": "#ffe1e4" },
  },
];

type KnowledgeGraphViewProps = {
  graph: KnowledgeGraph;
  expansionLimits: Readonly<Record<string, number>>;
  expandedNodeIds: ReadonlySet<string>;
  expandingNodeIds: ReadonlySet<string>;
  nodeLimitReached: boolean;
  onExpand: (node: KnowledgeGraphNode) => void;
};

export function KnowledgeGraphView({
  graph,
  expansionLimits,
  expandedNodeIds,
  expandingNodeIds,
  nodeLimitReached,
  onExpand,
}: KnowledgeGraphViewProps) {
  const [selected, setSelected] = useState<KnowledgeGraphNode | null>(null);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const matchedCount = useMemo(
    () => graph.nodes.filter((node) => node.matched).length,
    [graph.nodes],
  );
  const layoutOptions = useMemo(
    () => knowledgeGraphLayoutOptions(graph.nodes.length),
    [graph.nodes.length],
  );
  const elements = useMemo<cytoscape.ElementDefinition[]>(() => [
    ...graph.nodes.map((node) => ({
      group: "nodes" as const,
      classes: node.matched ? "knowledge-query-match" : undefined,
      data: { id: nodeElementId(node.id), nodeId: node.id, label: node.labels[0] || node.id },
    })),
    ...graph.edges
      .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
      .map((edge) => ({
        group: "edges" as const,
        data: {
          id: edgeElementId(edge.id),
          source: nodeElementId(edge.source),
          target: nodeElementId(edge.target),
          label: edge.type || "related",
        },
      })),
  ], [graph.edges, graph.nodes, nodeById]);

  const bindEvents = useCallback((core: cytoscape.Core) => {
    const selectNode = (event: cytoscape.EventObject) => setSelected(nodeById.get(event.target.data("nodeId")) ?? null);
    const clearSelection = (event: cytoscape.EventObject) => {
      if (event.target === core) setSelected(null);
    };
    core.on("tap", "node", selectNode);
    core.on("tap", clearSelection);
    return () => {
      core.off("tap", "node", selectNode);
      core.off("tap", clearSelection);
    };
  }, [nodeById]);

  useEffect(() => {
    if (!selected) return;
    const current = nodeById.get(selected.id);
    if (!current) setSelected(null);
    else if (current !== selected) setSelected(current);
  }, [nodeById, selected]);

  const selectedExpansionLimit = selected ? (expansionLimits[selected.id] ?? 0) : 0;
  const selectedExpanded = selected ? expandedNodeIds.has(selected.id) : false;
  const selectedExpanding = selected ? expandingNodeIds.has(selected.id) : false;

  return (
    <CytoscapeGraph
      className="knowledge-graph"
      ariaLabel="Knowledge graph"
      elements={elements}
      stylesheet={GRAPH_STYLES}
      layoutOptions={layoutOptions}
      fitPadding={FIT_PADDING}
      minZoom={0.08}
      wheelSensitivity={1.2}
      bindEvents={bindEvents}
    >
      {matchedCount > 0 ? (
        <div className="knowledge-graph-match-summary">
          <Search size={13} />
          <span>
            Marked {matchedCount} matched {matchedCount === 1 ? "node" : "nodes"}
          </span>
        </div>
      ) : null}
      {selected ? (
        <aside className="knowledge-graph-inspector">
          <strong>{selected.labels[0] || selected.id}</strong>
          <span>{selected.id}</span>
          {Object.entries(selected.properties).slice(0, 8).map(([key, value]) => (
            <div key={key}><span>{key}</span><p>{formatProperty(value)}</p></div>
          ))}
          <Button
            size="small"
            theme="solid"
            type="tertiary"
            icon={<Network size={14} />}
            loading={selectedExpanding}
            disabled={nodeLimitReached || selectedExpanded}
            onClick={() => onExpand(selected)}
          >
            {nodeLimitReached
              ? "Node limit reached"
              : selectedExpanded
                ? "Expanded"
                : selectedExpansionLimit > 0
                  ? "Load more"
                  : "Expand"}
          </Button>
        </aside>
      ) : null}
    </CytoscapeGraph>
  );
}

function formatProperty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function nodeElementId(id: string) {
  return `knowledge-node:${id}`;
}

function edgeElementId(id: string) {
  return `knowledge-edge:${id}`;
}

function knowledgeGraphLayoutOptions(nodeCount: number): CytoscapeLayoutOptions {
  const largeGraph = nodeCount > 300;
  return {
    name: "fcose",
    quality: largeGraph ? "draft" : "default",
    animate: false,
    randomize: true,
    nodeSeparation: largeGraph ? 72 : 100,
    idealEdgeLength: largeGraph ? 82 : 110,
    nodeRepulsion: largeGraph ? 5200 : 8000,
    numIter: largeGraph ? 900 : 1800,
  };
}
