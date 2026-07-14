import { Button, Popconfirm, Progress } from "@douyinfe/semi-ui";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Edit3,
  FolderKanban,
  FolderOpen,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRefreshWorkProjects } from "../../app/layouts/AdminLayout";
import { WORK_PROJECT_STATUS } from "../../shared/api/contract";
import {
  cancelWorkProject,
  createWorkProject,
  deleteWorkProject,
  getWorkProject,
  queryWorkProjects,
  retryWorkProject,
  updateWorkProjectMetadata,
} from "../../shared/api/workProjects";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import type {
  CreateWorkProjectRequest,
  WorkProject,
  WorkProjectSummary,
} from "../../shared/api/types";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { ResourcePageShell } from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { ResourceIdentity, ResourceText, RowActions } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { UI_TEXT } from "../../shared/lib/uiText";
import { WorkProjectFormModal } from "./WorkProjectFormModal";
import {
  WorkProjectAssets,
  WorkProjectPanel,
  WorkProjectStatusTag,
  WorkProjectSummaries,
  WorkProjectTasks,
  WorkProjectTypeTag,
  workProjectOwnerNames,
} from "./workProjectView";

type AdminAction = "cancel" | "retry" | "delete";

export function WorkProjectsPage() {
  const projects = usePagedResourceList<WorkProjectSummary>({ query: queryWorkProjects });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<WorkProject | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<WorkProject | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const detailRequestRef = useRef(0);
  const refreshProjectSidebar = useRefreshWorkProjects();
  const navigate = useNavigate();
  const [adminAction, setAdminAction] = useState<{ id: number; type: AdminAction } | null>(null);
  const adminActionRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      detailRequestRef.current += 1;
    };
  }, []);

  const refreshAll = useCallback(async () => {
    await projects.loadItems();
  }, [projects.loadItems]);

  useAdminResourceHeader({
    createLabel: "Create Project",
    refreshLabel: "Refresh work projects",
    loading: projects.loading || adminAction !== null || detailLoadingId !== null,
    onCreate: () => {
      setEditingProject(null);
      setModalOpen(true);
    },
    onRefresh: refreshAll,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModalOpen(false);
      setEditingProject(null);
      await refreshAll();
      refreshProjectSidebar();
    },
  });

  const summary = useMemo(
    () => projects.items.reduce(
      (acc, project) => ({
        working: acc.working + (project.status === WORK_PROJECT_STATUS.WORKING ? 1 : 0),
        sessions: acc.sessions + project.session_count,
        assets: acc.assets + project.asset_count,
      }),
      { working: 0, sessions: 0, assets: 0 },
    ),
    [projects.items],
  );

  const handleSubmit = (payload: CreateWorkProjectRequest) => submit(() => (
    editingProject
      ? updateWorkProjectMetadata(editingProject.id, payload)
      : createWorkProject(payload)
  ));

  const loadProjectDetail = useCallback(async (projectId: number): Promise<WorkProject | null> => {
    const requestId = ++detailRequestRef.current;
    setDetailLoadingId(projectId);
    try {
      const response = await getWorkProject(projectId);
      return mountedRef.current && requestId === detailRequestRef.current ? response.data ?? null : null;
    } catch (error) {
      if (mountedRef.current && requestId === detailRequestRef.current) showApiError(error);
      return null;
    } finally {
      if (mountedRef.current && requestId === detailRequestRef.current) setDetailLoadingId(null);
    }
  }, []);

  const toggleProject = async (project: WorkProjectSummary) => {
    if (expandedId === project.id) {
      detailRequestRef.current += 1;
      setExpandedId(null);
      setExpandedProject(null);
      setDetailLoadingId(null);
      return;
    }
    setExpandedId(project.id);
    setExpandedProject(null);
    const detail = await loadProjectDetail(project.id);
    if (detail) setExpandedProject(detail);
  };

  const openProjectEditor = async (project: WorkProjectSummary) => {
    const detail = await loadProjectDetail(project.id);
    if (!detail) return;
    setEditingProject(detail);
    setModalOpen(true);
  };

  const handleAdminProjectAction = async (
    project: WorkProjectSummary,
    type: AdminAction,
  ) => {
    if (adminActionRef.current) return;
    adminActionRef.current = true;
    setAdminAction({ id: project.id, type });
    try {
      const response = type === "cancel"
        ? await cancelWorkProject(project.id)
        : type === "retry"
          ? await retryWorkProject(project.id)
          : await deleteWorkProject(project.id);
      if (!mountedRef.current) return;
      showApiSuccess(response);
      if (type === "delete") {
        setExpandedId((current) => (current === project.id ? null : current));
      }
      await projects.loadItems();
      if (!mountedRef.current) return;
      if (expandedId === project.id && type !== "delete") {
        const detail = await loadProjectDetail(project.id);
        setExpandedProject(detail);
      }
      refreshProjectSidebar();
    } catch (error) {
      if (mountedRef.current) showApiError(error);
    } finally {
      adminActionRef.current = false;
      if (mountedRef.current) setAdminAction(null);
    }
  };

  const columns: ResourceColumn<WorkProjectSummary>[] = [
    {
      key: "project", header: "Project", width: "minmax(210px, 0.9fr)",
      render: (project) => (
        <ResourceIdentity
          before={(
            <Button
              icon={expandedId === project.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              theme="borderless"
              type="tertiary"
              size="small"
              disabled={adminAction !== null}
              loading={detailLoadingId === project.id && expandedId === project.id}
              onClick={() => void toggleProject(project)}
              aria-label={`${expandedId === project.id ? "Collapse" : "Expand"} ${project.name}`}
            />
          )}
          icon={<FolderKanban size={18} />}
          title={project.name}
          detail={`${workProjectOwnerNames(project)} · ${project.session_count} sessions`}
        />
      ),
    },
    { key: "type", header: "Type", width: "132px", render: (project) => <WorkProjectTypeTag project={project} /> },
    { key: "status", header: "Status", width: "104px", render: (project) => <WorkProjectStatusTag project={project} /> },
    {
      key: "records", header: "Records", width: "minmax(170px, 0.5fr)",
      render: (project) => <ResourceText>{project.asset_count} assets · {project.task_count} tasks</ResourceText>,
    },
    { key: "updated", header: "Updated", width: "minmax(150px, 0.4fr)", render: (p) => formatDateTime(p.updated_at) },
    {
      key: "actions", header: "Actions", width: "132px",
      render: (project) => (
        <RowActions>
          <Button
            icon={<FolderOpen size={15} />}
            theme="borderless"
            type="tertiary"
            aria-label={`Open workspace for ${project.name}`}
            disabled={adminAction !== null}
            onClick={() => navigate(`/work-projects/${project.id}`)}
          />
          <Button
            icon={<Edit3 size={15} />}
            theme="borderless"
            type="tertiary"
            aria-label={`Edit ${project.name}`}
            disabled={adminAction !== null}
            loading={detailLoadingId === project.id && expandedId !== project.id}
            onClick={() => void openProjectEditor(project)}
          />
          <Button
            icon={<Ban size={15} />}
            theme="borderless"
            type="danger"
            disabled={adminAction !== null || !project.can_cancel}
            loading={adminAction?.id === project.id && adminAction.type === "cancel"}
            aria-label={`Cancel ${project.name}`}
            onClick={() => void handleAdminProjectAction(project, "cancel")}
          />
          <Button
            icon={<RotateCcw size={15} />}
            theme="borderless"
            type="tertiary"
            disabled={adminAction !== null || !project.can_retry}
            loading={adminAction?.id === project.id && adminAction.type === "retry"}
            aria-label={`Retry ${project.name}`}
            onClick={() => void handleAdminProjectAction(project, "retry")}
          />
          <Popconfirm title="Delete project" content={`Delete ${project.name} and all project sessions?`} okType="danger" cancelText={UI_TEXT.cancel} onConfirm={() => void handleAdminProjectAction(project, "delete")}>
            <Button
              icon={<Trash2 size={15} />}
              theme="borderless"
              type="danger"
              disabled={adminAction !== null}
              loading={adminAction?.id === project.id && adminAction.type === "delete"}
              aria-label={`Delete ${project.name}`}
            />
          </Popconfirm>
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <ResourcePageShell
        searchPlaceholder="Search project name, type, description, or status"
        state={projects}
        metrics={[
          { label: "Total", value: projects.total },
          { label: "Working", value: summary.working },
          { label: "Project sessions", value: summary.sessions },
          { label: "Assets", value: summary.assets },
        ]}
        empty={projects.items.length === 0}
        emptyIcon={<FolderKanban size={42} />}
        emptyTitle="No projects found"
      >
        <ResourceTable<WorkProjectSummary>
          ariaLabel="Work projects"
          className="work-projects-table"
          columns={columns}
          rows={projects.items}
          rowKey={(project) => project.id}
        />
        {expandedId ? (
          <AsyncContent
            loading={detailLoadingId === expandedId}
            empty={expandedProject === null}
            emptyIcon={<FolderKanban size={42} />}
            emptyTitle="Project details are unavailable"
            wrapperClassName="work-project-detail-spin"
          >
            {expandedProject ? <WorkProjectExpanded project={expandedProject} /> : null}
          </AsyncContent>
        ) : null}
      </ResourcePageShell>

      <WorkProjectFormModal
        open={modalOpen}
        saving={saving}
        project={editingProject}
        onCancel={() => { setModalOpen(false); setEditingProject(null); }}
        onSubmit={handleSubmit}
      />
    </>
  );
}

function WorkProjectExpanded({
  project,
}: {
  project: WorkProject;
}) {
  return (
    <div className="work-project-expanded">
      <section className="work-project-meta">
        <div>
          <span>Owner</span>
          <strong>{workProjectOwnerNames(project)}</strong>
        </div>
        <div>
          <span>Sandbox</span>
          <strong>{project.sandbox_container?.container_name ?? "-"}</strong>
        </div>
        <div>
          <span>Task Progress</span>
          <Progress percent={project.progress} size="small" showInfo />
        </div>
      </section>

      <section className="work-project-detail-grid">
        <WorkProjectPanel title="Assets" empty={project.assets.length === 0 ? "No assets." : ""}>
          <WorkProjectAssets project={project} />
        </WorkProjectPanel>
        <WorkProjectPanel title="Tasks" empty={project.tasks.length === 0 ? "No tasks." : ""}>
          <WorkProjectTasks project={project} />
        </WorkProjectPanel>
        <WorkProjectPanel title="Agent Summaries" empty={project.agent_summaries.length === 0 ? "No summaries." : ""}>
          <WorkProjectSummaries project={project} />
        </WorkProjectPanel>
      </section>
    </div>
  );
}
