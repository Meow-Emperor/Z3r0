import { Button, Empty } from "@douyinfe/semi-ui";
import { ArrowLeft, FileText } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MetricStrip } from "../../shared/components/ResourcePageShell";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { WorkProjectRecordTabs } from "./ProjectRecordViews";
import { WorkProjectMarkdown } from "./WorkProjectMarkdown";
import { useWorkProjectDetails } from "./useWorkProjectDetails";
import { workProjectOwnerNames, WorkProjectStatusTag, WorkProjectTypeTag } from "./workProjectView";

export function WorkProjectWorkspacePage() {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) && projectId > 0 ? projectId : null;
  const { project, loading } = useWorkProjectDetails(validProjectId);

  const metrics = useMemo(() => [
    { label: "In Scope", value: project?.in_scope_asset_count ?? 0 },
    { label: "Untouched", value: project?.untouched_asset_count ?? 0 },
    { label: "Active Work", value: project?.active_work_item_count ?? 0 },
    { label: "Blocked", value: project?.blocked_work_item_count ?? 0 },
    { label: "Validated Findings", value: project?.validated_finding_count ?? 0 },
    { label: "Open Paths", value: project?.active_attack_path_count ?? 0 },
  ], [project]);

  if (!validProjectId) {
    return <Empty className="empty-state" image={<FileText size={42} />} title="Invalid project" description="" />;
  }

  return (
    <section className="work-project-workspace">
      <div className="workspace-back-row">
        <Button icon={<ArrowLeft size={15} />} theme="borderless" type="tertiary" onClick={() => navigate("/work-projects")}>
          Back
        </Button>
      </div>
      <div className="workspace-header">
        {project ? (
          <div className="workspace-title">
            <div className="workspace-title-main">
              <h2>{project.name}</h2>
              <WorkProjectMarkdown className="workspace-project-description" content={project.description} />
              <span>Owners: {workProjectOwnerNames(project)}</span>
            </div>
            <div className="workspace-title-tags">
              <WorkProjectTypeTag project={project} />
              <WorkProjectStatusTag project={project} />
            </div>
          </div>
        ) : null}
      </div>

      <MetricStrip metrics={metrics} />

      <AsyncContent
        loading={loading}
        empty={project === null}
        emptyIcon={<FileText size={42} />}
        emptyTitle="Project is unavailable"
        wrapperClassName="project-record-spin"
      >
        {project ? <WorkProjectRecordTabs projectId={project.id} className="workspace-tabs" /> : null}
      </AsyncContent>
    </section>
  );
}
