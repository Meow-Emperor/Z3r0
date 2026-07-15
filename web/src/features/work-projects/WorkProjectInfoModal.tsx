import { FileText, FolderKanban } from "lucide-react";
import { AppModal } from "../../shared/components/AppModal";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { type ProjectRecordTab, WorkProjectRecordTabs } from "./ProjectRecordViews";
import { WorkProjectMarkdown } from "./WorkProjectMarkdown";
import { useWorkProjectDetails } from "./useWorkProjectDetails";
import { WorkProjectStatusTag, WorkProjectTypeTag, workProjectOwnerNames } from "./workProjectView";

type WorkProjectInfoModalProps = {
  open: boolean;
  projectId: number | null;
  initialTab?: ProjectRecordTab;
  onClose: () => void;
};

export function WorkProjectInfoModal({ open, projectId, initialTab = "overview", onClose }: WorkProjectInfoModalProps) {
  const { project, loading } = useWorkProjectDetails(projectId, open);

  return (
    <AppModal
      open={open}
      title={project?.name ?? "Work Project"}
      titleIcon={<FolderKanban size={17} />}
      className="work-project-info-modal"
      width="min(1440px, calc(100vw - 24px))"
      height="min(820px, calc(100dvh - 32px))"
      onCancel={onClose}
    >
      <AsyncContent
        loading={loading}
        empty={project === null}
        emptyIcon={<FileText size={42} />}
        emptyTitle="No project selected."
        wrapperClassName="project-record-spin"
      >
        {project ? (
          <div className="project-info-content">
            <section className="project-info-summary">
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
                <div className="project-info-state">
                  <span>Operational State</span>
                  <strong>{project.untouched_asset_count} untouched assets</strong>
                  <small>{project.active_work_item_count} active · {project.blocked_work_item_count} blocked</small>
                </div>
              </section>
              <WorkProjectMarkdown className="project-info-description" content={project.description} />
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
