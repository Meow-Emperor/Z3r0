import { Input, Select, TabPane, Tabs, Tag } from "@douyinfe/semi-ui";
import { Activity, Boxes, Bug, ClipboardList, FileCheck2, Gauge, Network, Route } from "lucide-react";
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { showApiError } from "../../shared/api/feedback";
import type {
  WorkProjectAsset,
  WorkProjectAssetKind,
  WorkProjectAssetScope,
  WorkProjectAttackPathRecord,
  WorkProjectEvidenceKind,
  WorkProjectEvidenceRecord,
  WorkProjectEvidenceStatus,
  WorkProjectFindingSeverity,
  WorkProjectFindingRecord,
  WorkProjectFindingVerification,
  WorkProjectGraphView,
  WorkProjectOverview,
  WorkProjectWorkItemRecord,
  WorkProjectWorkItemStatus,
  WorkProjectWorkLog,
} from "../../shared/api/types";
import {
  getWorkProjectGraph,
  getWorkProjectOverview,
  queryWorkProjectActivity,
  queryWorkProjectAssets,
  queryWorkProjectAttackPaths,
  queryWorkProjectEvidence,
  queryWorkProjectFindings,
  queryWorkProjectWorkItems,
} from "../../shared/api/workProjects";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { ResourcePager, ResourceSearchForm } from "../../shared/components/ResourcePageShell";
import { TabLabel } from "../../shared/components/TabLabel";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { cx } from "../../shared/lib/className";
import { formatDateTime } from "../../shared/lib/date";
import {
  WORK_PROJECT_ASSET_KIND_VALUES,
  WORK_PROJECT_ASSET_SCOPE_VALUES,
  WORK_PROJECT_EVIDENCE_KIND_VALUES,
  WORK_PROJECT_EVIDENCE_STATUS_VALUES,
  WORK_PROJECT_FINDING_SEVERITY_VALUES,
  WORK_PROJECT_FINDING_VERIFICATION_VALUES,
  WORK_PROJECT_WORK_ITEM_STATUS_VALUES,
} from "../../shared/api/generated/constants";
import {
  WORK_PROJECT_ASSET_CRITICALITY_LABEL,
  WORK_PROJECT_ASSET_KIND_LABEL,
  WORK_PROJECT_ASSET_ORIGIN_LABEL,
  WORK_PROJECT_ASSET_SCOPE_COLOR,
  WORK_PROJECT_ASSET_SCOPE_LABEL,
  WORK_PROJECT_ASSET_STATE_LABEL,
  WORK_PROJECT_ATTACK_ACTION_LABEL,
  WORK_PROJECT_ATTACK_PATH_STATUS_COLOR,
  WORK_PROJECT_ATTACK_PATH_STATUS_LABEL,
  WORK_PROJECT_ATTACK_STEP_STATUS_LABEL,
  WORK_PROJECT_EVIDENCE_KIND_LABEL,
  WORK_PROJECT_EVIDENCE_STATUS_COLOR,
  WORK_PROJECT_EVIDENCE_STATUS_LABEL,
  WORK_PROJECT_FINDING_CATEGORY_LABEL,
  WORK_PROJECT_FINDING_RESOLUTION_LABEL,
  WORK_PROJECT_FINDING_SEVERITY_COLOR,
  WORK_PROJECT_FINDING_SEVERITY_LABEL,
  WORK_PROJECT_FINDING_VERIFICATION_COLOR,
  WORK_PROJECT_FINDING_VERIFICATION_LABEL,
  WORK_PROJECT_TARGET_STATUS_COLOR,
  WORK_PROJECT_TARGET_STATUS_LABEL,
  WORK_PROJECT_WORK_ITEM_PHASE_LABEL,
  WORK_PROJECT_WORK_ITEM_PRIORITY_LABEL,
  WORK_PROJECT_WORK_ITEM_STATUS_COLOR,
  WORK_PROJECT_WORK_ITEM_STATUS_LABEL,
  WORK_PROJECT_WORK_LOG_KIND_LABEL,
} from "../../shared/lib/labels";
import { ProjectGraphCanvas } from "./ProjectGraphCanvas";
import { WorkProjectMarkdown } from "./WorkProjectMarkdown";
import { formatWorkProjectAsset } from "./workProjectView";

export type ProjectRecordTab = "overview" | "workflow" | "graph" | "assets" | "findings" | "attack-paths" | "evidence" | "activity";
type Props = { projectId: number; initialTab?: ProjectRecordTab; className?: string };
const EMPTY_GRAPH: WorkProjectGraphView = { assets: [], relations: [], finding_counts: {}, active_work_item_counts: {}, attack_path_counts: {}, is_truncated: false };

export function WorkProjectRecordTabs(props: Props) {
  return <ProjectRecordTabs key={props.projectId} {...props} />;
}

function ProjectRecordTabs({ projectId, initialTab = "overview", className }: Props) {
  const [activeTab, setActiveTab] = useState<ProjectRecordTab>(initialTab);
  const [assetKind, setAssetKind] = useState<WorkProjectAssetKind>();
  const [assetScope, setAssetScope] = useState<WorkProjectAssetScope>();
  const [evidenceKind, setEvidenceKind] = useState<WorkProjectEvidenceKind>();
  const [evidenceStatus, setEvidenceStatus] = useState<WorkProjectEvidenceStatus>();
  const [findingVerification, setFindingVerification] = useState<WorkProjectFindingVerification>();
  const [findingSeverity, setFindingSeverity] = useState<WorkProjectFindingSeverity>();
  const [workItemStatus, setWorkItemStatus] = useState<WorkProjectWorkItemStatus>();
  const [workItemAssignee, setWorkItemAssignee] = useState("");
  const assets = usePagedResourceList<WorkProjectAsset>({ query: useCallback((params) => queryWorkProjectAssets(projectId, { ...params, kind: assetKind, scope: assetScope }), [assetKind, assetScope, projectId]), enabled: activeTab === "assets" });
  const evidence = usePagedResourceList<WorkProjectEvidenceRecord>({ query: useCallback((params) => queryWorkProjectEvidence(projectId, { ...params, kind: evidenceKind, status: evidenceStatus }), [evidenceKind, evidenceStatus, projectId]), enabled: activeTab === "evidence" });
  const findings = usePagedResourceList<WorkProjectFindingRecord>({ query: useCallback((params) => queryWorkProjectFindings(projectId, { ...params, verification: findingVerification, severity: findingSeverity }), [findingSeverity, findingVerification, projectId]), enabled: activeTab === "findings" });
  const paths = usePagedResourceList<WorkProjectAttackPathRecord>({ query: useCallback((params) => queryWorkProjectAttackPaths(projectId, params), [projectId]), enabled: activeTab === "attack-paths" });
  const workItems = usePagedResourceList<WorkProjectWorkItemRecord>({ query: useCallback((params) => queryWorkProjectWorkItems(projectId, { ...params, status: workItemStatus, assignee_agent_code: workItemAssignee }), [projectId, workItemAssignee, workItemStatus]), enabled: activeTab === "workflow" });
  const activity = usePagedResourceList<WorkProjectWorkLog>({ query: useCallback(({ page, size }) => queryWorkProjectActivity(projectId, { page, size }), [projectId]), enabled: activeTab === "activity" });
  const [overview, setOverview] = useState<WorkProjectOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [graph, setGraph] = useState<WorkProjectGraphView>(EMPTY_GRAPH);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphLoaded, setGraphLoaded] = useState(false);

  useEffect(() => {
    if (activeTab !== "overview" || overviewLoaded) return;
    let canceled = false;
    setOverviewLoading(true);
    getWorkProjectOverview(projectId).then((response) => {
      if (!canceled) {
        setOverview(response.data ?? null);
        setOverviewLoaded(true);
      }
    }).catch((error) => !canceled && showApiError(error)).finally(() => !canceled && setOverviewLoading(false));
    return () => { canceled = true; };
  }, [activeTab, overviewLoaded, projectId]);

  useEffect(() => {
    if (activeTab !== "graph" || graphLoaded) return;
    let canceled = false;
    setGraphLoading(true);
    getWorkProjectGraph(projectId).then((response) => {
      if (!canceled) {
        setGraph(response.data ?? EMPTY_GRAPH);
        setGraphLoaded(true);
      }
    }).catch((error) => !canceled && showApiError(error)).finally(() => !canceled && setGraphLoading(false));
    return () => { canceled = true; };
  }, [activeTab, graphLoaded, projectId]);

  return <Tabs type="line" className={cx("project-record-tabs", className)} activeKey={activeTab} onChange={(key) => setActiveTab(key as ProjectRecordTab)}>
    <TabPane tab={<TabLabel icon={<Gauge size={14} />} text="Overview" />} itemKey="overview"><AsyncContent loading={overviewLoading} empty={overviewLoaded && !overview} emptyTitle="No project state." wrapperClassName="project-record-fill">{overview ? <OverviewView value={overview} /> : null}</AsyncContent></TabPane>
    <TabPane tab={<TabLabel icon={<ClipboardList size={14} />} text="Workflow" />} itemKey="workflow"><Paged state={workItems} empty="No work items." toolbar={<RecordQueryBar state={workItems} placeholder="Search work items"><EnumFilter value={workItemStatus} values={WORK_PROJECT_WORK_ITEM_STATUS_VALUES} labels={WORK_PROJECT_WORK_ITEM_STATUS_LABEL} placeholder="All statuses" onChange={(value) => { workItems.goToFirstPage(); setWorkItemStatus(value); }} /><Input value={workItemAssignee} placeholder="Assignee code" showClear onChange={(value) => { workItems.goToFirstPage(); setWorkItemAssignee(value.trim()); }} /></RecordQueryBar>}><WorkItemList records={workItems.items} /></Paged></TabPane>
    <TabPane tab={<TabLabel icon={<Network size={14} />} text="Graph" />} itemKey="graph"><AsyncContent loading={graphLoading} empty={graphLoaded && !graph.assets.length} emptyTitle="No graph data." wrapperClassName="project-record-fill"><GraphView graph={graph} /></AsyncContent></TabPane>
    <TabPane tab={<TabLabel icon={<Boxes size={14} />} text="Assets" />} itemKey="assets"><Paged state={assets} empty="No assets." toolbar={<RecordQueryBar state={assets} placeholder="Search assets"><EnumFilter value={assetKind} values={WORK_PROJECT_ASSET_KIND_VALUES} labels={WORK_PROJECT_ASSET_KIND_LABEL} placeholder="All kinds" onChange={(value) => { assets.goToFirstPage(); setAssetKind(value); }} /><EnumFilter value={assetScope} values={WORK_PROJECT_ASSET_SCOPE_VALUES} labels={WORK_PROJECT_ASSET_SCOPE_LABEL} placeholder="All scopes" onChange={(value) => { assets.goToFirstPage(); setAssetScope(value); }} /></RecordQueryBar>}><AssetList assets={assets.items} /></Paged></TabPane>
    <TabPane tab={<TabLabel icon={<Bug size={14} />} text="Findings" />} itemKey="findings"><Paged state={findings} empty="No findings." toolbar={<RecordQueryBar state={findings} placeholder="Search findings"><EnumFilter value={findingVerification} values={WORK_PROJECT_FINDING_VERIFICATION_VALUES} labels={WORK_PROJECT_FINDING_VERIFICATION_LABEL} placeholder="All verification" onChange={(value) => { findings.goToFirstPage(); setFindingVerification(value); }} /><EnumFilter value={findingSeverity} values={WORK_PROJECT_FINDING_SEVERITY_VALUES} labels={WORK_PROJECT_FINDING_SEVERITY_LABEL} placeholder="All severities" onChange={(value) => { findings.goToFirstPage(); setFindingSeverity(value); }} /></RecordQueryBar>}><FindingList records={findings.items} /></Paged></TabPane>
    <TabPane tab={<TabLabel icon={<Route size={14} />} text="Attack Paths" />} itemKey="attack-paths"><Paged state={paths} empty="No attack paths." toolbar={<RecordQueryBar state={paths} placeholder="Search attack paths" />}><AttackPathList records={paths.items} /></Paged></TabPane>
    <TabPane tab={<TabLabel icon={<FileCheck2 size={14} />} text="Evidence" />} itemKey="evidence"><Paged state={evidence} empty="No evidence." toolbar={<RecordQueryBar state={evidence} placeholder="Search evidence"><EnumFilter value={evidenceKind} values={WORK_PROJECT_EVIDENCE_KIND_VALUES} labels={WORK_PROJECT_EVIDENCE_KIND_LABEL} placeholder="All kinds" onChange={(value) => { evidence.goToFirstPage(); setEvidenceKind(value); }} /><EnumFilter value={evidenceStatus} values={WORK_PROJECT_EVIDENCE_STATUS_VALUES} labels={WORK_PROJECT_EVIDENCE_STATUS_LABEL} placeholder="All statuses" onChange={(value) => { evidence.goToFirstPage(); setEvidenceStatus(value); }} /></RecordQueryBar>}><EvidenceList records={evidence.items} /></Paged></TabPane>
    <TabPane tab={<TabLabel icon={<Activity size={14} />} text="Activity" />} itemKey="activity"><Paged state={activity} empty="No workflow activity."><ActivityList records={activity.items} /></Paged></TabPane>
  </Tabs>;
}

type PagedState = ReturnType<typeof usePagedResourceList<unknown>>;
function Paged({ state, empty, toolbar, children }: { state: PagedState; empty: string; toolbar?: ReactNode; children: ReactNode }) {
  return <div className={cx("project-record-paged", Boolean(toolbar) && "has-filters")}>{toolbar}<AsyncContent loading={state.loading} empty={state.loaded && !state.items.length} emptyTitle={empty}>{children}</AsyncContent><ResourcePager state={state} /></div>;
}

function RecordQueryBar({ state, placeholder, children }: { state: PagedState; placeholder: string; children?: ReactNode }) {
  return <div className="project-record-filters"><ResourceSearchForm value={state.keyword} placeholder={placeholder} onChange={state.setKeyword} onSearch={state.search} />{children}</div>;
}

function EnumFilter<T extends string>({ value, values, labels, placeholder, onChange }: { value?: T; values: readonly T[]; labels: Record<T, string>; placeholder: string; onChange: (value: T | undefined) => void }) {
  return <Select value={value} placeholder={placeholder} optionList={values.map((item) => ({ value: item, label: labels[item] }))} showClear onClear={() => onChange(undefined)} onChange={(next) => onChange(typeof next === "string" && values.includes(next as T) ? next as T : undefined)} />;
}

function OverviewView({ value }: { value: WorkProjectOverview }) {
  const metrics = [
    ["In-scope assets", value.in_scope_asset_total], ["Untouched assets", value.untouched_asset_total],
    ["Covered targets", value.covered_target_total], ["Blocked targets", value.blocked_target_total],
    ["Evidence", value.evidence_total], ["Running agents", value.running_agent_count],
  ] as const;
  return <div className="project-overview"><div className="project-overview-metrics">{metrics.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div><StateBuckets title="Work Items" values={value.work_item_status_counts} labels={WORK_PROJECT_WORK_ITEM_STATUS_LABEL} /><StateBuckets title="Findings" values={value.finding_verification_counts} labels={WORK_PROJECT_FINDING_VERIFICATION_LABEL} /><StateBuckets title="Attack Paths" values={value.attack_path_status_counts} labels={WORK_PROJECT_ATTACK_PATH_STATUS_LABEL} /></div>;
}

function GraphView({ graph }: { graph: WorkProjectGraphView }) {
  return <div className="project-graph-view">
    {graph.is_truncated ? <span className="project-graph-limit">Showing a bounded view of up to 1,000 assets and 4,000 relations.</span> : null}
    <ProjectGraphCanvas
      assets={graph.assets}
      relations={graph.relations}
      findingCounts={graph.finding_counts}
      activeWorkItemCounts={graph.active_work_item_counts}
      attackPathCounts={graph.attack_path_counts}
    />
  </div>;
}

function StateBuckets({ title, values, labels }: { title: string; values: Record<string, number>; labels: Record<string, string> }) {
  return <section className="project-state-buckets"><h3>{title}</h3><div>{Object.entries(values).map(([label, count]) => <span key={label}><b>{count}</b>{labels[label] ?? label}</span>)}</div></section>;
}

function AssetList({ assets }: { assets: WorkProjectAsset[] }) {
  return (
    <div className="project-record-list">
      {assets.map((asset) => (
        <article key={asset.id} className="project-record-item">
          <header>
            <strong>{formatWorkProjectAsset(asset)}</strong>
            <Tag color={WORK_PROJECT_ASSET_SCOPE_COLOR[asset.scope]}>{WORK_PROJECT_ASSET_SCOPE_LABEL[asset.scope]}</Tag>
          </header>
          <dl>
            <Row label="Kind" value={WORK_PROJECT_ASSET_KIND_LABEL[asset.kind]} />
            <Row label="Locator" value={asset.locator} />
            <Row label="Origin" value={WORK_PROJECT_ASSET_ORIGIN_LABEL[asset.origin]} />
            <Row label="State" value={WORK_PROJECT_ASSET_STATE_LABEL[asset.state]} />
            <Row label="Criticality" value={WORK_PROJECT_ASSET_CRITICALITY_LABEL[asset.criticality]} />
            <MarkdownRow label="Summary" content={asset.summary} />
          </dl>
        </article>
      ))}
    </div>
  );
}

function WorkItemList({ records }: { records: WorkProjectWorkItemRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ work_item: item, targets, target_assets, dependency_ids, evidence, work_log_total, subordinate_run_ids }) => (
        <article key={item.id} className="project-record-item project-work-item">
          <header>
            <div><small>{WORK_PROJECT_WORK_ITEM_PHASE_LABEL[item.phase]}</small><strong>{item.title}</strong></div>
            <Tag color={WORK_PROJECT_WORK_ITEM_STATUS_COLOR[item.status]}>{WORK_PROJECT_WORK_ITEM_STATUS_LABEL[item.status]}</Tag>
          </header>
          <div className="record-tag-row">
            <Tag>{WORK_PROJECT_WORK_ITEM_PRIORITY_LABEL[item.priority]}</Tag>
            <Tag>{item.assignee_agent_code}</Tag>
            {dependency_ids.length ? <Tag>{dependency_ids.length} dependencies</Tag> : null}
            {subordinate_run_ids.length ? <Tag>{subordinate_run_ids.length} runs</Tag> : null}
          </div>
          <Narrative label="Objective" content={item.objective} />
          <dl>
            <MarkdownRow label="Execution scope" content={item.execution_scope} />
            <MarkdownRow label="Completion criteria" content={item.completion_criteria} />
          </dl>
          <div className="project-target-list">
            {targets.map((target) => (
              <div key={target.id}>
                <header>
                  <span>{assetName(target_assets, target.asset_id)}</span>
                  <small>{target.surface}</small>
                  <Tag color={WORK_PROJECT_TARGET_STATUS_COLOR[target.status]}>{WORK_PROJECT_TARGET_STATUS_LABEL[target.status]}</Tag>
                </header>
                <Narrative label="Conclusion" content={target.conclusion} />
                <Narrative label="Deferral" content={target.deferral_reason} />
              </div>
            ))}
          </div>
          <Narrative className="record-warning" label="Blocker" content={item.blocker_reason} />
          <Narrative label="Result" content={item.result_summary} />
          <footer>
            <span>{evidence.length} evidence</span>
            <span>{work_log_total} workflow events</span>
            <span>{formatDateTime(item.updated_at)}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}

function FindingList({ records }: { records: WorkProjectFindingRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ finding, primary_asset, affected_assets, evidence }) => (
        <article key={finding.id} className="project-record-item">
          <header>
            <div><small>{WORK_PROJECT_FINDING_CATEGORY_LABEL[finding.category]}</small><strong>{finding.title}</strong></div>
            <div>
              <Tag color={WORK_PROJECT_FINDING_SEVERITY_COLOR[finding.severity]}>{WORK_PROJECT_FINDING_SEVERITY_LABEL[finding.severity]}</Tag>
              <Tag color={WORK_PROJECT_FINDING_VERIFICATION_COLOR[finding.verification]}>{WORK_PROJECT_FINDING_VERIFICATION_LABEL[finding.verification]}</Tag>
            </div>
          </header>
          <dl>
            <Row label="Primary asset" value={formatWorkProjectAsset(primary_asset)} />
            <Row label="Affected assets" value={affected_assets.map(formatWorkProjectAsset).join(", ")} />
            <MarkdownRow label="Description" content={finding.description} />
            <MarkdownRow label="Preconditions" content={finding.preconditions} />
            <MarkdownRow label="Impact" content={finding.impact} />
            <MarkdownRow label="Recommendation" content={finding.recommendation} />
            <Row label="Resolution" value={finding.resolution ? WORK_PROJECT_FINDING_RESOLUTION_LABEL[finding.resolution] : ""} />
            <Row label="CWE" value={finding.cwe_id} />
            <Row label="CVSS" value={finding.cvss_score != null ? `${finding.cvss_score} · ${finding.cvss_vector}` : finding.cvss_vector} />
            <MarkdownRow label="Deferred" content={finding.deferral_reason} />
          </dl>
          <footer><span>{evidence.length} evidence</span><span>{formatDateTime(finding.updated_at)}</span></footer>
        </article>
      ))}
    </div>
  );
}

function AttackPathList({ records }: { records: WorkProjectAttackPathRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ path, status, steps, assets, evidence }) => (
        <article key={path.id} className="project-record-item">
          <header>
            <strong>{path.title}</strong>
            <Tag color={WORK_PROJECT_ATTACK_PATH_STATUS_COLOR[status]}>{WORK_PROJECT_ATTACK_PATH_STATUS_LABEL[status]}</Tag>
          </header>
          <Narrative label="Objective" content={path.objective} />
          <div className="attack-path-steps">
            {steps.map((step) => (
              <div key={step.id}>
                <b>{step.sequence}</b>
                <section className="attack-step-content">
                  <strong>{WORK_PROJECT_ATTACK_ACTION_LABEL[step.action]}</strong>
                  <small>{assetName(assets, step.source_asset_id)} → {assetName(assets, step.target_asset_id)}</small>
                  <Narrative label="Description" content={step.description} />
                  <Narrative label="Preconditions" content={step.preconditions} />
                  <Narrative label="Result" content={step.result} />
                  <Narrative className="record-warning" label="Blocker" content={step.blocker_reason} />
                  {step.attack_technique_id ? <code>{step.attack_technique_id}</code> : null}
                </section>
                <Tag>{WORK_PROJECT_ATTACK_STEP_STATUS_LABEL[step.status]}</Tag>
              </div>
            ))}
          </div>
          <Narrative label="Summary" content={path.summary} />
          <Narrative className="record-warning" label="Archive reason" content={path.archive_reason} />
          <footer><span>{evidence.length} evidence</span><span>{formatDateTime(path.updated_at)}</span></footer>
        </article>
      ))}
    </div>
  );
}

function EvidenceList({ records }: { records: WorkProjectEvidenceRecord[] }) {
  return (
    <div className="project-record-list">
      {records.map(({ evidence, primary_asset }) => (
        <article key={evidence.id} className="project-record-item">
          <header>
            <div><small>{WORK_PROJECT_EVIDENCE_KIND_LABEL[evidence.kind]}</small><strong>{evidence.title}</strong></div>
            <Tag color={WORK_PROJECT_EVIDENCE_STATUS_COLOR[evidence.status]}>{WORK_PROJECT_EVIDENCE_STATUS_LABEL[evidence.status]}</Tag>
          </header>
          <Narrative label="Summary" content={evidence.summary} />
          <dl>
            <Row label="Work item" value={`#${evidence.work_item_id}`} />
            <Row label="Asset" value={primary_asset ? formatWorkProjectAsset(primary_asset) : ""} />
            <Row label="Reference" value={evidence.reference} />
            <Row label="SHA-256" value={evidence.sha256} />
            <Row label="Supersedes" value={evidence.supersedes_evidence_id ? `Evidence #${evidence.supersedes_evidence_id}` : ""} />
            <MarkdownRow label="Invalidation" content={evidence.invalidation_reason} />
          </dl>
          <footer><span>{evidence.created_by_agent_code || "system"}</span><span>{formatDateTime(evidence.captured_at)}</span></footer>
        </article>
      ))}
    </div>
  );
}

function ActivityList({ records }: { records: WorkProjectWorkLog[] }) {
  return (
    <div className="project-activity-list">
      {records.map((entry) => (
        <article key={entry.id}>
          <header>
            <span>{WORK_PROJECT_WORK_LOG_KIND_LABEL[entry.kind]}</span>
            <strong>Work item #{entry.work_item_id}</strong>
            <small>{entry.created_by_agent_code || "system"} · {formatDateTime(entry.created_at)}</small>
          </header>
          <WorkProjectMarkdown content={entry.content} />
        </article>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <Fragment><dt>{label}</dt><dd>{value}</dd></Fragment>;
}

function MarkdownRow({ label, content }: { label: string; content?: string }) {
  if (!content?.trim()) return null;
  return <Fragment><dt>{label}</dt><dd><WorkProjectMarkdown content={content} /></dd></Fragment>;
}

function Narrative({ label, content, className }: { label: string; content?: string; className?: string }) {
  if (!content?.trim()) return null;
  return <div className={cx("project-narrative", className)}><small>{label}</small><WorkProjectMarkdown content={content} /></div>;
}

function assetName(assets: WorkProjectAsset[], id: number): string {
  const asset = assets.find((item) => item.id === id);
  return asset ? formatWorkProjectAsset(asset) : `Asset #${id}`;
}
