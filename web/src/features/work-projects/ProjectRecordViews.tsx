import { TabPane, Tabs, Tag } from "@douyinfe/semi-ui";
import { Boxes, Bug, FileText, Network, Route } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { WORK_PROJECT_ASSET_TYPE } from "../../shared/api/contract";
import { showApiError } from "../../shared/api/feedback";
import type {
  WorkProjectAsset,
  WorkProjectAttackPathRecord,
  WorkProjectFindingRecord,
  WorkProjectGraphView,
} from "../../shared/api/types";
import {
  getWorkProjectGraph,
  queryWorkProjectAssets,
  queryWorkProjectAttackPaths,
  queryWorkProjectFindings,
} from "../../shared/api/workProjects";
import { ResourcePager } from "../../shared/components/ResourcePageShell";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { TabLabel } from "../../shared/components/TabLabel";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { cx } from "../../shared/lib/className";
import { formatDateTime } from "../../shared/lib/date";
import {
  WORK_PROJECT_ASSET_ORIGIN_COLOR,
  WORK_PROJECT_ASSET_ORIGIN_LABEL,
  WORK_PROJECT_ASSET_TYPE_LABEL,
  WORK_PROJECT_ATTACK_PATH_STATUS_COLOR,
  WORK_PROJECT_ATTACK_PATH_STATUS_LABEL,
  WORK_PROJECT_FINDING_SEVERITY_COLOR,
  WORK_PROJECT_FINDING_SEVERITY_LABEL,
  WORK_PROJECT_FINDING_STATUS_COLOR,
  WORK_PROJECT_FINDING_STATUS_LABEL,
} from "../../shared/lib/labels";
import { ProjectGraphCanvas } from "./ProjectGraphCanvas";
import { filledDetailItems, type DetailItem } from "./recordDetails";
import { formatWorkProjectAsset } from "./workProjectView";

export type ProjectRecordTab = "assets" | "findings" | "attack-paths" | "graph";

type WorkProjectRecordTabsProps = {
  projectId: number;
  initialTab?: ProjectRecordTab;
  className?: string;
};

const EMPTY_GRAPH: WorkProjectGraphView = { assets: [], edges: [], is_truncated: false };

export function WorkProjectRecordTabs(props: WorkProjectRecordTabsProps) {
  return <ProjectRecordTabs key={props.projectId} {...props} />;
}

function ProjectRecordTabs({ projectId, initialTab = "assets", className }: WorkProjectRecordTabsProps) {
  const [activeTab, setActiveTab] = useState<ProjectRecordTab>(initialTab);
  const queryAssets = useCallback(
    (params: { page: number; size: number; keyword: string }) => queryWorkProjectAssets(projectId, params),
    [projectId],
  );
  const queryFindings = useCallback(
    ({ page, size }: { page: number; size: number }) => queryWorkProjectFindings(projectId, { page, size }),
    [projectId],
  );
  const queryAttackPaths = useCallback(
    ({ page, size }: { page: number; size: number }) => queryWorkProjectAttackPaths(projectId, { page, size }),
    [projectId],
  );
  const assets = usePagedResourceList<WorkProjectAsset>({ query: queryAssets, enabled: activeTab === "assets" });
  const findings = usePagedResourceList<WorkProjectFindingRecord>({
    query: queryFindings,
    enabled: activeTab === "findings",
  });
  const attackPaths = usePagedResourceList<WorkProjectAttackPathRecord>({
    query: queryAttackPaths,
    enabled: activeTab === "attack-paths",
  });
  const [graph, setGraph] = useState<WorkProjectGraphView>(EMPTY_GRAPH);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphLoaded, setGraphLoaded] = useState(false);

  useEffect(() => {
    if (activeTab !== "graph" || graphLoaded) return;
    let canceled = false;
    setGraphLoading(true);
    getWorkProjectGraph(projectId)
      .then((response) => {
        if (!canceled) {
          setGraph(response.data ?? EMPTY_GRAPH);
          setGraphLoaded(true);
        }
      })
      .catch((error) => {
        if (!canceled) showApiError(error);
      })
      .finally(() => {
        if (!canceled) setGraphLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [activeTab, graphLoaded, projectId]);

  return (
    <Tabs
      type="line"
      className={cx("project-record-tabs", className)}
      activeKey={activeTab}
      onChange={(key) => setActiveTab(key as ProjectRecordTab)}
    >
      <TabPane tab={<TabLabel icon={<Boxes size={14} />} text="Assets" />} itemKey="assets">
        <PagedRecordView state={assets} emptyTitle="No assets."><AssetList assets={assets.items} /></PagedRecordView>
      </TabPane>
      <TabPane tab={<TabLabel icon={<Bug size={14} />} text="Findings" />} itemKey="findings">
        <PagedRecordView state={findings} emptyTitle="No findings."><FindingList records={findings.items} /></PagedRecordView>
      </TabPane>
      <TabPane tab={<TabLabel icon={<Route size={14} />} text="Attack Paths" />} itemKey="attack-paths">
        <PagedRecordView state={attackPaths} emptyTitle="No attack paths."><AttackPathList records={attackPaths.items} /></PagedRecordView>
      </TabPane>
      <TabPane tab={<TabLabel icon={<Network size={14} />} text="Graph" />} itemKey="graph">
        <AsyncContent
          loading={graphLoading}
          empty={graph.assets.length === 0}
          emptyIcon={<FileText size={42} />}
          emptyTitle="No assets to graph."
          wrapperClassName="project-record-spin"
        >
          <GraphView graph={graph} />
        </AsyncContent>
      </TabPane>
    </Tabs>
  );
}

type PagedState = ReturnType<typeof usePagedResourceList<unknown>>;

function PagedRecordView({ state, emptyTitle, children }: {
  state: PagedState;
  emptyTitle: string;
  children: ReactNode;
}) {
  return (
    <div className="project-record-page">
      <AsyncContent
        loading={state.loading}
        empty={state.items.length === 0}
        emptyIcon={<FileText size={42} />}
        emptyTitle={emptyTitle}
        wrapperClassName="project-record-list-scroll"
      >
        {children}
      </AsyncContent>
      <ResourcePager state={state} />
    </div>
  );
}

function AssetList({ assets }: { assets: WorkProjectAsset[] }) {
  return (
    <div className="project-record-list">
      {assets.map((asset) => (
        <article key={asset.id} className="project-record-row">
          <header>
            <strong>{formatWorkProjectAsset(asset)}</strong>
            <div>
              <Tag>{WORK_PROJECT_ASSET_TYPE_LABEL[asset.type]}</Tag>
              <Tag color={WORK_PROJECT_ASSET_ORIGIN_COLOR[asset.origin]}>{WORK_PROJECT_ASSET_ORIGIN_LABEL[asset.origin]}</Tag>
            </div>
          </header>
          <RecordDetails items={assetBaseMeta(asset)} />
          <RecordDetails className="project-record-details-extension" items={[["Banner", asset.extra?.banner]]} />
        </article>
      ))}
    </div>
  );
}

function FindingList({ records }: { records: WorkProjectFindingRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ finding, asset }) => (
        <article key={finding.id} className="project-record-row">
          <header>
            <strong>{finding.title}</strong>
            <div>
              <Tag color={WORK_PROJECT_FINDING_SEVERITY_COLOR[finding.severity]}>{WORK_PROJECT_FINDING_SEVERITY_LABEL[finding.severity]}</Tag>
              <Tag color={WORK_PROJECT_FINDING_STATUS_COLOR[finding.status]}>{WORK_PROJECT_FINDING_STATUS_LABEL[finding.status]}</Tag>
            </div>
          </header>
          <p>{finding.description || finding.impact || "No description"}</p>
          <RecordDetails items={[
            ["Asset", asset ? formatWorkProjectAsset(asset) : finding.asset_id ? `#${finding.asset_id}` : undefined],
            ["Substantiates edge", finding.edge_id ? `#${finding.edge_id}` : undefined],
            ["Updated", formatDateTime(finding.updated_at)],
          ]} />
        </article>
      ))}
    </div>
  );
}

function AttackPathList({ records }: { records: WorkProjectAttackPathRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ path, steps, edges, assets }) => {
        const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
        const assetLabels = new Map(assets.map((asset) => [asset.id, formatWorkProjectAsset(asset)]));
        return (
          <article key={path.id} className="project-record-row project-attack-path">
            <header>
              <strong>{path.title}</strong>
              <Tag color={WORK_PROJECT_ATTACK_PATH_STATUS_COLOR[path.status]}>{WORK_PROJECT_ATTACK_PATH_STATUS_LABEL[path.status]}</Tag>
            </header>
            {path.summary ? <p>{path.summary}</p> : null}
            <ol>
              {steps.map((step) => {
                const edge = edgeById.get(step.edge_id);
                const source = edge ? assetLabels.get(edge.source_asset_id) ?? `#${edge.source_asset_id}` : "Unknown";
                const target = edge ? assetLabels.get(edge.target_asset_id) ?? `#${edge.target_asset_id}` : "Unknown";
                return <li key={step.id}><strong>{source} to {target}</strong>{edge?.label ? <span>{edge.label}</span> : null}</li>;
              })}
            </ol>
          </article>
        );
      })}
    </div>
  );
}

function GraphView({ graph }: { graph: WorkProjectGraphView }) {
  return (
    <div className="project-graph-view">
      {graph.is_truncated ? <span className="project-graph-limit">Showing a bounded view of up to 1,000 assets and 4,000 relationships.</span> : null}
      <ProjectGraphCanvas assets={graph.assets} edges={graph.edges} />
    </div>
  );
}

function RecordDetails({ className, items }: { className?: string; items: DetailItem[] }) {
  const visible = filledDetailItems(items);
  if (!visible.length) return null;
  return (
    <div className={cx("project-record-details", className)}>
      {visible.map(([label, value]) => <span key={label}><strong>{label}</strong>{value}</span>)}
    </div>
  );
}

function assetBaseMeta(asset: WorkProjectAsset): DetailItem[] {
  if (asset.type === WORK_PROJECT_ASSET_TYPE.BINARY) return [["Path", asset.path]];
  return [["Host", asset.host], ["Port", asset.port?.toString()]];
}
