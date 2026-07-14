import { Progress } from "@douyinfe/semi-ui";
import { FileText, FolderKanban, UserRound } from "lucide-react";
import { AppModal } from "../../shared/components/AppModal";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { type ProjectRecordTab, WorkProjectRecordTabs } from "./ProjectRecordViews";
import { useWorkProjectDetails } from "./useWorkProjectDetails";
import {
  WorkProjectPanel,
  WorkProjectStatusTag,
  WorkProjectSummaries,
  WorkProjectTasks,
  WorkProjectTypeTag,
  workProjectOwnerNames,
} from "./workProjectView";

type WorkProjectInfoModalProps = {
  open: boolean;
  projectId: number | null;
  initialTab?: ProjectRecordTab;
  onClose: () => void;
};

export function WorkProjectInfoModal({ open, projectId, initialTab = "assets", onClose }: WorkProjectInfoModalProps) {
  const { project, loading } = useWorkProjectDetails(projectId, open);

  return (
    <AppModal
      open={open}
      title={project?.name ?? "Work Project"}
      titleIcon={<FolderKanban size={17} />}
      width="min(1440px, calc(100vw - 24px))"
      onCancel={onClose}
    >
      <AsyncContent
        loading={loading}
        empty={project === null}
        emptyIcon={<FileText size={42} />}
        emptyTitle="No project selected."
      >
        {project ? (
          <div className="project-info-content project-record-content">
            <section className="project-info-main">
              <section className="project-info-meta">
                <div>
                  <span>Type</span>
                  <WorkProjectTypeTag project={project} />
                </div>
                <div>
                  <span>Status</span>
                  <WorkProjectStatusTag project={project} />
                </div>
                <div>
                  <span>Owners</span>
                  <strong>{workProjectOwnerNames(project)}</strong>
                </div>
                <div>
                  <span>Sandbox</span>
                  <strong>{project.sandbox_container?.container_name ?? "-"}</strong>
                </div>
              </section>

              {project.description ? <div className="project-info-description">{project.description}</div> : null}

              <section className="project-info-progress">
                <span>Task Progress</span>
                <Progress percent={project.progress} size="small" showInfo />
              </section>

              <WorkProjectPanel
                title="Tasks"
                icon={<FileText size={15} />}
                empty={!project.tasks.length ? "No data." : ""}
                mode="info"
              >
                <WorkProjectTasks project={project} mode="info" />
              </WorkProjectPanel>

              <WorkProjectPanel
                title="Agent Summaries"
                icon={<UserRound size={15} />}
                empty={!project.agent_summaries.length ? "No data." : ""}
                mode="info"
              >
                <WorkProjectSummaries project={project} mode="info" />
              </WorkProjectPanel>
            </section>

            <section className="project-record-panel">
              <WorkProjectRecordTabs
                projectId={project.id}
                initialTab={initialTab}
              />
            </section>
          </div>
        ) : null}
      </AsyncContent>
    </AppModal>
  );
}
