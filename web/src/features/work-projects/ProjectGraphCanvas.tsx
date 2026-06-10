import { Maximize2, Minus, Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  WORK_PROJECT_ASSET_TYPE,
  WORK_PROJECT_ASSET_TYPES,
  WORK_PROJECT_GRAPH_EDGE_CATEGORIES,
  workProjectEdgeCategory,
  type WorkProjectGraphEdgeCategory,
} from "../../shared/api/contract";
import type { WorkProjectAsset, WorkProjectAssetType, WorkProjectGraphEdge } from "../../shared/api/types";
import {
  WORK_PROJECT_ASSET_ORIGIN_LABEL,
  WORK_PROJECT_ASSET_TYPE_LABEL,
  WORK_PROJECT_GRAPH_EDGE_CATEGORY_LABEL,
  WORK_PROJECT_GRAPH_EDGE_TYPE_LABEL,
} from "../../shared/lib/labels";
import { formatWorkProjectAsset } from "./workProjectView";

// Visual encoding. Keyed by the contract enums so a new asset type / edge category
// fails the build here until it is given a color, instead of silently falling back.
const ASSET_TYPE_COLOR: Record<WorkProjectAssetType, string> = {
  [WORK_PROJECT_ASSET_TYPE.SERVICE]: "#2f6fed",
  [WORK_PROJECT_ASSET_TYPE.DOMAIN]: "#0d9aa8",
  [WORK_PROJECT_ASSET_TYPE.NETWORK]: "#7c5cff",
  [WORK_PROJECT_ASSET_TYPE.BINARY]: "#e08a13",
};

const EDGE_CATEGORY_COLOR: Record<WorkProjectGraphEdgeCategory, string> = {
  structural: "#5b7ba6",
  offensive: "#d92d3a",
};

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 600;
const NODE_RADIUS = 8;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
// Minimum center-to-center distance enforced after layout so related nodes never overlap.
const MIN_SEPARATION = 58;
const VIEW_PADDING = 56;
const FIT_PADDING = 58;
const MAX_LAYOUT_EXTENT = 3000;
const MAX_PAN_OFFSET = 12000;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_MARGIN = 10;

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type ViewTransform = { x: number; y: number; k: number };
type HoverTarget =
  | { kind: "node"; asset: WorkProjectAsset }
  | { kind: "edge"; edge: WorkProjectGraphEdge };
type HoverState = { target: HoverTarget; left: number; top: number; containerWidth: number; containerHeight: number };
type DragState =
  | { kind: "node"; pointerId: number; id: number }
  | { kind: "pan"; pointerId: number; startX: number; startY: number; originX: number; originY: number };

export function ProjectGraphCanvas({ assets, edges }: { assets: WorkProjectAsset[]; edges: WorkProjectGraphEdge[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => assetById.has(edge.source_asset_id) && assetById.has(edge.target_asset_id)),
    [edges, assetById],
  );
  const edgeCurveById = useMemo(() => edgeCurves(visibleEdges), [visibleEdges]);
  const layout = useMemo(() => computeLayout(assets, visibleEdges), [assets, visibleEdges]);
  const layoutBounds = useMemo(() => boundsFor(layout, assets), [assets, layout]);
  const fittedView = useMemo(() => fitView(layoutBounds), [layoutBounds]);

  const [positions, setPositions] = useState<Record<number, Point>>(layout);
  const [view, setView] = useState<ViewTransform>(fittedView);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    setPositions(layout);
    setView(fittedView);
    setHover(null);
    dragRef.current = null;
  }, [fittedView, layout]);

  // Translate a pointer event into the unscaled viewBox coordinate space.
  const toViewBox = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_WIDTH,
      y: ((clientY - rect.top) / rect.height) * VIEW_HEIGHT,
    };
  }, []);

  const toContent = useCallback(
    (clientX: number, clientY: number): Point => {
      const local = toViewBox(clientX, clientY);
      if (!isFinitePoint(local) || !Number.isFinite(view.k) || view.k <= 0) return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
      return sanitizePoint({ x: (local.x - view.x) / view.k, y: (local.y - view.y) / view.k });
    },
    [toViewBox, view],
  );

  const containerPoint = useCallback((clientX: number, clientY: number): Omit<HoverState, "target"> => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      left: clientX - (rect?.left ?? 0),
      top: clientY - (rect?.top ?? 0),
      containerWidth: rect?.width ?? VIEW_WIDTH,
      containerHeight: rect?.height ?? VIEW_HEIGHT,
    };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    setView((current) => {
      if (!Number.isFinite(factor) || factor <= 0) return current;
      const currentScale = Number.isFinite(current.k) && current.k > 0 ? current.k : 1;
      const next = clamp(currentScale * factor, MIN_SCALE, MAX_SCALE);
      const local = toViewBox(clientX, clientY);
      if (!isFinitePoint(local)) return current;
      const cx = (local.x - current.x) / currentScale;
      const cy = (local.y - current.y) / currentScale;
      return sanitizeView({ k: next, x: local.x - cx * next, y: local.y - cy * next });
    });
  }, [toViewBox]);

  // Native non-passive wheel listener so zoom can suppress page scrolling.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onNodePointerDown = (event: ReactPointerEvent, id: number) => {
    event.stopPropagation();
    dragRef.current = { kind: "node", pointerId: event.pointerId, id };
    setHover(null);
    capturePointer(event.pointerId);
  };

  const onBackgroundPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number.isFinite(view.x) ? view.x : 0,
      originY: Number.isFinite(view.y) ? view.y : 0,
    };
    setHover(null);
    capturePointer(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "node") {
      const point = toContent(event.clientX, event.clientY);
      const id = drag.id;
      setPositions((current) => ({ ...current, [id]: point }));
      return;
    }
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * VIEW_WIDTH;
    const dy = ((event.clientY - drag.startY) / rect.height) * VIEW_HEIGHT;
    setView((current) => sanitizeView({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
  };

  const endInteraction = (event: ReactPointerEvent) => {
    if (dragRef.current && dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releasePointer(event.pointerId);
  };

  const onCanvasPointerLeave = () => {
    if (!dragRef.current) setHover(null);
  };

  const moveHover = (event: ReactPointerEvent, target: HoverTarget) => {
    if (dragRef.current) return;
    setHover({ target, ...containerPoint(event.clientX, event.clientY) });
  };

  const zoomFromCenter = (factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const resetView = () => setView(fittedView);

  const capturePointer = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // Pointer capture may fail if the pointer has already been canceled by the browser.
    }
  };

  const releasePointer = (pointerId: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    } catch {
      // Ignore stale pointer ids from lost/canceled interactions.
    }
  };

  return (
    <div className="project-graph" ref={containerRef}>
      <svg
        ref={svgRef}
        className="project-graph-canvas"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Work project relationship graph"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onPointerLeave={onCanvasPointerLeave}
        onLostPointerCapture={endInteraction}
      >
        <defs>
          {WORK_PROJECT_GRAPH_EDGE_CATEGORIES.map((category) => (
            <marker
              key={category}
              id={`graph-arrow-${category}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="10"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_CATEGORY_COLOR[category]} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {visibleEdges.map((edge) => {
            const source = positions[edge.source_asset_id];
            const target = positions[edge.target_asset_id];
            if (!source || !target) return null;
            const category = workProjectEdgeCategory(edge.type);
            const end = retract(source, target, NODE_RADIUS + 1);
            const curve = resolvedEdgeCurve(edge, edgeCurveById.get(edge.id) ?? 0);
            const active = hover?.target.kind === "edge" && hover.target.edge.id === edge.id;
            return (
              <g key={edge.id}>
                <path
                  className="project-graph-edge"
                  stroke={EDGE_CATEGORY_COLOR[category]}
                  strokeWidth={active ? 3 : category === "offensive" ? 2 : 1.5}
                  fill="none"
                  d={edgePath(source, end, curve)}
                  markerEnd={`url(#graph-arrow-${category})`}
                />
                <path
                  className="project-graph-edge-hit"
                  fill="none"
                  d={edgePath(source, target, curve)}
                  onPointerEnter={(event) => moveHover(event, { kind: "edge", edge })}
                  onPointerMove={(event) => moveHover(event, { kind: "edge", edge })}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}

          {assets.map((asset) => {
            const point = positions[asset.id];
            if (!point) return null;
            const active = hover?.target.kind === "node" && hover.target.asset.id === asset.id;
            return (
              <g key={asset.id} transform={`translate(${point.x} ${point.y})`} className="project-graph-node">
                <circle
                  r={NODE_RADIUS}
                  fill={ASSET_TYPE_COLOR[asset.type]}
                  strokeWidth={active ? 3 : 2}
                  onPointerDown={(event) => onNodePointerDown(event, asset.id)}
                  onPointerEnter={(event) => moveHover(event, { kind: "node", asset })}
                  onPointerMove={(event) => moveHover(event, { kind: "node", asset })}
                  onPointerLeave={() => setHover(null)}
                />
                <text y={NODE_RADIUS + 13}>{truncate(formatWorkProjectAsset(asset), 22)}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <GraphLegend />

      <div className="project-graph-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomFromCenter(1.2)}>
          <Plus size={15} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomFromCenter(1 / 1.2)}>
          <Minus size={15} />
        </button>
        <button type="button" aria-label="Reset view" onClick={resetView}>
          <Maximize2 size={14} />
        </button>
      </div>

      {hover ? <GraphTooltip hover={hover} assetById={assetById} /> : null}
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="project-graph-legend">
      <div className="project-graph-legend-group">
        <span className="project-graph-legend-title">Nodes</span>
        {WORK_PROJECT_ASSET_TYPES.map((type) => (
          <span key={type} className="project-graph-legend-item">
            <i className="project-graph-legend-dot" style={{ background: ASSET_TYPE_COLOR[type] }} />
            {WORK_PROJECT_ASSET_TYPE_LABEL[type]}
          </span>
        ))}
      </div>
      <div className="project-graph-legend-group">
        <span className="project-graph-legend-title">Edges</span>
        {WORK_PROJECT_GRAPH_EDGE_CATEGORIES.map((category) => (
          <span key={category} className="project-graph-legend-item">
            <i className="project-graph-legend-line" style={{ background: EDGE_CATEGORY_COLOR[category] }} />
            {WORK_PROJECT_GRAPH_EDGE_CATEGORY_LABEL[category]}
          </span>
        ))}
      </div>
    </div>
  );
}

function GraphTooltip({ hover, assetById }: { hover: HoverState; assetById: Map<number, WorkProjectAsset> }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const rows = useMemo(
    () => hover.target.kind === "node"
      ? nodeRows(hover.target.asset)
      : edgeRows(hover.target.edge, assetById),
    [assetById, hover.target],
  );

  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element) return;
    const updateSize = () => {
      const next = { width: element.offsetWidth, height: element.offsetHeight };
      setSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows]);

  const style = tooltipStyle(hover, size);

  return (
    <div ref={tooltipRef} className="project-graph-tooltip" style={style}>
      <strong>{rows.title}</strong>
      <dl>
        {rows.items.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

function tooltipStyle(hover: HoverState, size: { width: number; height: number }): { left: number; top: number } {
  const maxLeft = Math.max(TOOLTIP_MARGIN, hover.containerWidth - size.width - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, hover.containerHeight - size.height - TOOLTIP_MARGIN);
  const left = hover.left + TOOLTIP_OFFSET + size.width > hover.containerWidth - TOOLTIP_MARGIN
    ? hover.left - size.width - TOOLTIP_OFFSET
    : hover.left + TOOLTIP_OFFSET;
  const top = hover.top + TOOLTIP_OFFSET + size.height > hover.containerHeight - TOOLTIP_MARGIN
    ? hover.top - size.height - TOOLTIP_OFFSET
    : hover.top + TOOLTIP_OFFSET;
  return {
    left: clamp(left, TOOLTIP_MARGIN, maxLeft),
    top: clamp(top, TOOLTIP_MARGIN, maxTop),
  };
}

function nodeRows(asset: WorkProjectAsset): { title: string; items: Array<[string, string]> } {
  const items: Array<[string, string | undefined]> = [
    ["Type", WORK_PROJECT_ASSET_TYPE_LABEL[asset.type]],
    ["Origin", WORK_PROJECT_ASSET_ORIGIN_LABEL[asset.origin]],
    asset.type === WORK_PROJECT_ASSET_TYPE.BINARY ? ["Path", asset.path] : ["Host", asset.host],
    ["Port", asset.port ? String(asset.port) : undefined],
    ["Banner", asset.extra?.banner],
  ];
  return { title: formatWorkProjectAsset(asset), items: keepFilled(items) };
}

function edgeRows(edge: WorkProjectGraphEdge, assetById: Map<number, WorkProjectAsset>): { title: string; items: Array<[string, string]> } {
  const source = assetById.get(edge.source_asset_id);
  const target = assetById.get(edge.target_asset_id);
  const items: Array<[string, string | undefined]> = [
    ["Category", WORK_PROJECT_GRAPH_EDGE_CATEGORY_LABEL[workProjectEdgeCategory(edge.type)]],
    ["From", source ? formatWorkProjectAsset(source) : `#${edge.source_asset_id}`],
    ["To", target ? formatWorkProjectAsset(target) : `#${edge.target_asset_id}`],
    ["Label", edge.label],
  ];
  return { title: WORK_PROJECT_GRAPH_EDGE_TYPE_LABEL[edge.type], items: keepFilled(items) };
}

function keepFilled(items: Array<[string, string | undefined]>): Array<[string, string]> {
  return items.filter((item): item is [string, string] => Boolean(item[1]));
}

// Deterministic Fruchterman-Reingold layout so the same graph always renders the same shape.
function computeLayout(assets: WorkProjectAsset[], edges: WorkProjectGraphEdge[]): Record<number, Point> {
  const count = assets.length;
  const positions: Record<number, Point> = {};
  if (!count) return positions;
  const density = count > 1 ? edges.length / count : 0;
  const layoutSize = layoutDimensions(count, edges.length);
  const center = { x: layoutSize.width / 2, y: layoutSize.height / 2 };
  assets.forEach((asset, index) => {
    const angle = (2 * Math.PI * index) / Math.max(count, 1);
    const ring = 0.22 + ((index % 5) * 0.045);
    positions[asset.id] = {
      x: center.x + Math.cos(angle) * layoutSize.width * ring,
      y: center.y + Math.sin(angle) * layoutSize.height * ring,
    };
  });
  if (count <= 1) return positions;

  const degrees = nodeDegrees(assets, edges);
  const ideal = clamp(Math.sqrt((layoutSize.width * layoutSize.height) / count) * (0.82 + Math.min(density, 3) * 0.08), 72, 160);
  const iterations = count > 160 ? 150 : count > 90 ? 210 : 300;
  let temperature = Math.min(layoutSize.width, layoutSize.height) / 10;

  for (let step = 0; step < iterations; step += 1) {
    const displacement: Record<number, Point> = {};
    for (const asset of assets) displacement[asset.id] = { x: 0, y: 0 };

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const a = positions[assets[i].id];
        const b = positions[assets[j].id];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const degreeBoost = 1 + Math.min((degrees.get(assets[i].id) ?? 0) + (degrees.get(assets[j].id) ?? 0), 12) * 0.018;
        const force = ((ideal * ideal) / distance) * degreeBoost;
        const ux = (dx / distance) * force;
        const uy = (dy / distance) * force;
        displacement[assets[i].id].x += ux;
        displacement[assets[i].id].y += uy;
        displacement[assets[j].id].x -= ux;
        displacement[assets[j].id].y -= uy;
      }
    }

    for (const edge of edges) {
      const a = positions[edge.source_asset_id];
      const b = positions[edge.target_asset_id];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const sourceDegree = degrees.get(edge.source_asset_id) ?? 1;
      const targetDegree = degrees.get(edge.target_asset_id) ?? 1;
      const edgeIdeal = ideal * (1 + Math.min(sourceDegree + targetDegree, 14) * 0.006);
      const force = (distance * distance) / edgeIdeal;
      const ux = (dx / distance) * force;
      const uy = (dy / distance) * force;
      displacement[edge.source_asset_id].x -= ux;
      displacement[edge.source_asset_id].y -= uy;
      displacement[edge.target_asset_id].x += ux;
      displacement[edge.target_asset_id].y += uy;
    }

    for (const asset of assets) {
      const move = displacement[asset.id];
      const length = Math.hypot(move.x, move.y) || 0.01;
      const limited = Math.min(length, temperature);
      positions[asset.id].x = clamp(positions[asset.id].x + (move.x / length) * limited, VIEW_PADDING, layoutSize.width - VIEW_PADDING);
      positions[asset.id].y = clamp(positions[asset.id].y + (move.y / length) * limited, VIEW_PADDING, layoutSize.height - VIEW_PADDING);
    }
    temperature *= 0.94;
  }

  separate(positions, assets, minSeparation(count, edges.length), layoutSize);
  return sanitizePositions(positions, assets);
}

// Push apart any node pair closer than MIN_SEPARATION so densely linked clusters stay readable.
function separate(
  positions: Record<number, Point>,
  assets: WorkProjectAsset[],
  minDistance: number,
  layoutSize: { width: number; height: number },
): void {
  for (let pass = 0; pass < 260; pass += 1) {
    let moved = false;
    for (let i = 0; i < assets.length; i += 1) {
      for (let j = i + 1; j < assets.length; j += 1) {
        const a = positions[assets[i].id];
        const b = positions[assets[j].id];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance === 0) {
          // Deterministically nudge coincident nodes apart (no randomness, stable layout).
          dx = i - j - 1;
          dy = 1;
          distance = Math.hypot(dx, dy);
        }
        if (distance >= minDistance) continue;
        const shift = (minDistance - distance) / 2;
        const ux = (dx / distance) * shift;
        const uy = (dy / distance) * shift;
        a.x -= ux;
        a.y -= uy;
        b.x += ux;
        b.y += uy;
        a.x = clamp(a.x, VIEW_PADDING, layoutSize.width - VIEW_PADDING);
        a.y = clamp(a.y, VIEW_PADDING, layoutSize.height - VIEW_PADDING);
        b.x = clamp(b.x, VIEW_PADDING, layoutSize.width - VIEW_PADDING);
        b.y = clamp(b.y, VIEW_PADDING, layoutSize.height - VIEW_PADDING);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function sanitizePositions(positions: Record<number, Point>, assets: WorkProjectAsset[]): Record<number, Point> {
  const result: Record<number, Point> = {};
  for (const asset of assets) {
    result[asset.id] = sanitizePoint(positions[asset.id]);
  }
  return result;
}

function layoutDimensions(nodeCount: number, edgeCount: number): { width: number; height: number } {
  const complexity = Math.max(1, nodeCount + edgeCount * 0.28);
  const scale = clamp(Math.sqrt(complexity / 22), 1, 2.8);
  return {
    width: Math.min(MAX_LAYOUT_EXTENT, VIEW_WIDTH * scale),
    height: Math.min(MAX_LAYOUT_EXTENT, VIEW_HEIGHT * scale),
  };
}

function minSeparation(nodeCount: number, edgeCount: number): number {
  const density = nodeCount > 0 ? edgeCount / nodeCount : 0;
  return clamp(MIN_SEPARATION + density * 5 + Math.sqrt(nodeCount) * 0.7, MIN_SEPARATION, 92);
}

function boundsFor(positions: Record<number, Point>, assets: WorkProjectAsset[]): Bounds {
  const points = assets.map((asset) => positions[asset.id]).filter(isFinitePoint);
  if (!points.length) {
    return { minX: 0, minY: 0, maxX: VIEW_WIDTH, maxY: VIEW_HEIGHT };
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function fitView(bounds: Bounds): ViewTransform {
  const width = Math.max(bounds.maxX - bounds.minX, NODE_RADIUS * 2);
  const height = Math.max(bounds.maxY - bounds.minY, NODE_RADIUS * 2);
  const scale = clamp(Math.min((VIEW_WIDTH - FIT_PADDING * 2) / width, (VIEW_HEIGHT - FIT_PADDING * 2) / height), MIN_SCALE, MAX_SCALE);
  return sanitizeView({
    k: scale,
    x: (VIEW_WIDTH - width * scale) / 2 - bounds.minX * scale,
    y: (VIEW_HEIGHT - height * scale) / 2 - bounds.minY * scale,
  });
}

function nodeDegrees(assets: WorkProjectAsset[], edges: WorkProjectGraphEdge[]): Map<number, number> {
  const degrees = new Map(assets.map((asset) => [asset.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.source_asset_id, (degrees.get(edge.source_asset_id) ?? 0) + 1);
    degrees.set(edge.target_asset_id, (degrees.get(edge.target_asset_id) ?? 0) + 1);
  }
  return degrees;
}

function edgeCurves(edges: WorkProjectGraphEdge[]): Map<number, number> {
  const groups = new Map<string, WorkProjectGraphEdge[]>();
  for (const edge of edges) {
    const key = edgePairKey(edge);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const curves = new Map<number, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.id - b.id);
    for (let index = 0; index < group.length; index += 1) {
      curves.set(group[index].id, (index - (group.length - 1) / 2) * 26);
    }
  }
  return curves;
}

function edgePairKey(edge: WorkProjectGraphEdge): string {
  const low = Math.min(edge.source_asset_id, edge.target_asset_id);
  const high = Math.max(edge.source_asset_id, edge.target_asset_id);
  return `${low}:${high}`;
}

function resolvedEdgeCurve(edge: WorkProjectGraphEdge, curve: number): number {
  if (curve === 0) return 0;
  return edge.source_asset_id <= edge.target_asset_id ? curve : -curve;
}

function edgePath(source: Point, target: Point, curve: number): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const cx = (source.x + target.x) / 2 + nx * curve;
  const cy = (source.y + target.y) / 2 + ny * curve;
  if (Math.abs(curve) < 0.1) {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  }
  return `M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`;
}

function retract(source: Point, target: Point, distance: number): Point {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: target.x - (dx / length) * distance, y: target.y - (dy / length) * distance };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function sanitizePoint(point: Point): Point {
  return {
    x: clamp(finiteOr(point.x, VIEW_WIDTH / 2), -MAX_LAYOUT_EXTENT, MAX_LAYOUT_EXTENT),
    y: clamp(finiteOr(point.y, VIEW_HEIGHT / 2), -MAX_LAYOUT_EXTENT, MAX_LAYOUT_EXTENT),
  };
}

function sanitizeView(view: ViewTransform): ViewTransform {
  return {
    x: clamp(finiteOr(view.x, 0), -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
    y: clamp(finiteOr(view.y, 0), -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
    k: clamp(finiteOr(view.k, 1), MIN_SCALE, MAX_SCALE),
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
