import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../lib/className";

cytoscape.use(fcose);

const DEFAULT_FIT_PADDING = 64;
const DEFAULT_ZOOM_FACTOR = 1.4;

export type CytoscapeLayoutOptions = cytoscape.BaseLayoutOptions & {
  name: string;
  [key: string]: unknown;
};

type CytoscapeGraphProps = {
  ariaLabel: string;
  className?: string;
  elements: cytoscape.ElementDefinition[];
  stylesheet: cytoscape.StylesheetJson;
  layoutOptions: CytoscapeLayoutOptions;
  fitPadding?: number;
  minZoom?: number;
  maxZoom?: number;
  wheelSensitivity?: number;
  hideLabelsOnViewport?: boolean;
  bindEvents?: (core: cytoscape.Core) => (() => void) | void;
  children?: ReactNode;
};

export function CytoscapeGraph({
  ariaLabel,
  className,
  elements,
  stylesheet,
  layoutOptions,
  fitPadding = DEFAULT_FIT_PADDING,
  minZoom = 0.06,
  maxZoom = 4,
  wheelSensitivity = 1.4,
  hideLabelsOnViewport = true,
  bindEvents,
  children,
}: CytoscapeGraphProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<cytoscape.Core | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  useEffect(() => {
    if (!canvasRef.current || coreRef.current) return;
    const core = cytoscape({
      container: canvasRef.current,
      elements: [],
      minZoom,
      maxZoom,
      wheelSensitivity,
      boxSelectionEnabled: false,
      hideLabelsOnViewport,
      style: stylesheet,
    });
    coreRef.current = core;

    const observer = new ResizeObserver(() => {
      core.resize();
      core.fit(undefined, fitPadding);
    });
    observer.observe(canvasRef.current);

    return () => {
      observer.disconnect();
      layoutRef.current?.stop();
      layoutRef.current = null;
      core.destroy();
      coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const core = coreRef.current;
    if (!core || !bindEvents) return;
    return bindEvents(core);
  }, [bindEvents]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.style(stylesheet);
  }, [stylesheet]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    layoutRef.current?.stop();
    layoutRef.current = null;
    core.elements().remove();
    if (elements.length === 0) return;

    core.add(elements);
    const layout = core.layout({
      ...layoutOptions,
      fit: true,
      padding: fitPadding,
      stop: () => {
        if (layoutRef.current !== layout) return;
        core.fit(undefined, fitPadding);
        layoutRef.current = null;
      },
    } as cytoscape.LayoutOptions);
    layoutRef.current = layout;
    layout.run();
  }, [elements, fitPadding, layoutOptions]);

  const zoom = (factor: number) => {
    const core = coreRef.current;
    const canvas = canvasRef.current;
    if (!core || !canvas) return;
    const level = Math.min(Math.max(core.zoom() * factor, minZoom), maxZoom);
    core.zoom({
      level,
      renderedPosition: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
    });
  };

  const fit = () => {
    const core = coreRef.current;
    if (!core) return;
    core.resize();
    core.fit(undefined, fitPadding);
  };

  return (
    <div className={cx("cytoscape-graph", className)}>
      <div ref={canvasRef} className="cytoscape-graph-canvas" role="img" aria-label={ariaLabel} />
      <div className="cytoscape-graph-controls">
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(DEFAULT_ZOOM_FACTOR)}>
          <Plus size={15} />
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / DEFAULT_ZOOM_FACTOR)}>
          <Minus size={15} />
        </button>
        <button type="button" aria-label="Fit graph" title="Fit graph" onClick={fit}>
          <Maximize2 size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}
