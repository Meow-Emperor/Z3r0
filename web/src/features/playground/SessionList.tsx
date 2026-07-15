import { Button, Input, Popconfirm } from "@douyinfe/semi-ui";
import { ChevronDown, ChevronRight, Edit3, FolderKanban, Info, MessageCircle, MessageSquarePlus, Play, Trash2 } from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { updateAgentSessionTitle } from "../../shared/api/agentSessions";
import { showApiError } from "../../shared/api/feedback";
import { RESOURCE_PAGE_SIZE } from "../../shared/api/generated/constants";
import {
  createWorkProjectSession,
  deleteWorkProjectSession,
  listWorkProjectSessions,
  queryWorkProjects,
} from "../../shared/api/workProjects";
import type { AgentSessionSummary, WorkProjectSummary } from "../../shared/api/types";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { FormField } from "../../shared/components/FormField";
import { ResourceModal } from "../../shared/components/ResourceModal";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { useMountedRef } from "../../shared/hooks/useMountedRef";
import { mergeByKey } from "../../shared/lib/array";
import { cx } from "../../shared/lib/className";
import { UI_TEXT } from "../../shared/lib/uiText";
import { WorkProjectInfoModal } from "../work-projects/WorkProjectInfoModal";

const PROJECT_REFRESH_INTERVAL_MS = 5_000;

type SessionListProps = {
  sessions: AgentSessionSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  activeSessionId: string | null;
  projectListVersion: number;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRefreshSessions: () => Promise<void>;
  onLoadMoreSessions: () => Promise<void>;
  onDropRuntime: (sessionId: string) => void;
  onSyncSessionSummaries: (items: AgentSessionSummary[]) => void;
};

type ProjectSessionState = {
  loading: boolean;
  loadingMore: boolean;
  items: AgentSessionSummary[];
  page: number;
  total: number;
};

type ChatSessionRowProps = {
  session: AgentSessionSummary;
  active: boolean;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename: (session: AgentSessionSummary) => void;
};

type SessionRowProps = {
  active: boolean;
  className?: string;
  deleteConfirm?: {
    title: string;
    content: string;
    onConfirm: () => void;
  };
  icon: ReactNode;
  session: AgentSessionSummary;
  titleFallback: string;
  onRename: () => void;
  onSelect: () => void;
};

type ProjectGroupProps = {
  project: WorkProjectSummary;
  state?: ProjectSessionState;
  expanded: boolean;
  activeSessionId: string | null;
  onToggle: (projectId: number) => void;
  onShowInfo: (project: WorkProjectSummary) => void;
  onCreateSession: (project: WorkProjectSummary) => void;
  onLoadMoreSessions: (projectId: number) => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (session: AgentSessionSummary, projectId: number) => void;
  onDeleteSession: (projectId: number, sessionId: string) => void;
};

type RenameTarget = {
  session: AgentSessionSummary;
  projectId?: number;
};

export function SessionList({
  sessions,
  loading,
  loadingMore,
  hasMore,
  activeSessionId,
  projectListVersion,
  onSelect,
  onDelete,
  onRefreshSessions,
  onLoadMoreSessions,
  onDropRuntime,
  onSyncSessionSummaries,
}: SessionListProps) {
  const [projects, setProjects] = useState<WorkProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [projectSessions, setProjectSessions] = useState<Map<number, ProjectSessionState>>(() => new Map());
  const [infoProjectId, setInfoProjectId] = useState<number | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const mountedRef = useMountedRef();
  const projectsRequestRef = useRef(0);
  const projectsLoadRequestRef = useRef<number | null>(null);
  const projectsLoadMoreRequestRef = useRef<number | null>(null);
  const projectSessionRequestRef = useRef<Map<number, number>>(new Map());
  const projectSessionBusyRef = useRef<Set<number>>(new Set());
  const { saving: renaming, submit } = useResourceSubmit();

  useEffect(() => {
    return () => {
      projectsRequestRef.current += 1;
      projectsLoadRequestRef.current = null;
      projectsLoadMoreRequestRef.current = null;
      projectSessionRequestRef.current.clear();
      projectSessionBusyRef.current.clear();
    };
  }, []);

  const loadProjects = useCallback(async (silent = false) => {
    const requestId = projectsRequestRef.current + 1;
    projectsRequestRef.current = requestId;
    projectsLoadRequestRef.current = requestId;
    projectsLoadMoreRequestRef.current = null;
    setProjectsLoadingMore(false);
    if (!silent) setProjectsLoading(true);
    try {
      const response = await queryWorkProjects({ page: 1, size: RESOURCE_PAGE_SIZE, keyword: "" });
      if (!mountedRef.current || projectsRequestRef.current !== requestId) return;
      const items = response.data?.items ?? [];
      setProjects(items);
      setProjectsPage(1);
      setProjectsTotal(response.data?.total ?? items.length);
    } catch (error) {
      if (!silent && mountedRef.current && projectsRequestRef.current === requestId) showApiError(error);
    } finally {
      if (projectsLoadRequestRef.current === requestId) {
        projectsLoadRequestRef.current = null;
      }
      if (!silent && mountedRef.current && projectsRequestRef.current === requestId) {
        setProjectsLoading(false);
      }
    }
  }, []);

  const loadMoreProjects = useCallback(async () => {
    if (
      projectsLoadRequestRef.current !== null
      || projectsLoadMoreRequestRef.current !== null
      || projects.length >= projectsTotal
    ) return;
    const nextPage = projectsPage + 1;
    const requestId = projectsRequestRef.current + 1;
    projectsRequestRef.current = requestId;
    projectsLoadMoreRequestRef.current = requestId;
    setProjectsLoadingMore(true);
    try {
      const response = await queryWorkProjects({ page: nextPage, size: RESOURCE_PAGE_SIZE, keyword: "" });
      if (!mountedRef.current || projectsRequestRef.current !== requestId) return;
      const items = response.data?.items ?? [];
      setProjects((current) => mergeByKey(current, items, (project) => project.id));
      setProjectsPage(nextPage);
      setProjectsTotal(response.data?.total ?? projectsTotal);
    } catch (error) {
      if (mountedRef.current && projectsRequestRef.current === requestId) showApiError(error);
    } finally {
      if (projectsLoadMoreRequestRef.current === requestId) {
        projectsLoadMoreRequestRef.current = null;
      }
      if (mountedRef.current && projectsRequestRef.current === requestId) {
        setProjectsLoadingMore(false);
      }
    }
  }, [projects.length, projectsPage, projectsTotal]);

  const loadProjectSessions = useCallback(async (projectId: number, page = 1, silent = false) => {
    if (projectSessionBusyRef.current.has(projectId)) return;
    projectSessionBusyRef.current.add(projectId);
    const requestId = (projectSessionRequestRef.current.get(projectId) ?? 0) + 1;
    projectSessionRequestRef.current.set(projectId, requestId);
    if (!silent) {
      setProjectSessions((prev) => {
        const current = prev.get(projectId);
        return new Map(prev).set(projectId, {
          loading: page === 1,
          loadingMore: page > 1,
          items: current?.items ?? [],
          page: current?.page ?? 0,
          total: current?.total ?? 0,
        });
      });
    }
    try {
      const response = await listWorkProjectSessions(projectId, { page, size: RESOURCE_PAGE_SIZE });
      if (!mountedRef.current || projectSessionRequestRef.current.get(projectId) !== requestId) return;
      const items = response.data?.items ?? [];
      setProjectSessions((prev) => {
        const current = prev.get(projectId);
        return new Map(prev).set(projectId, {
          loading: false,
          loadingMore: false,
          items: page === 1 ? items : mergeByKey(current?.items ?? [], items, (session) => session.session_id),
          page,
          total: response.data?.total ?? items.length,
        });
      });
      onSyncSessionSummaries(items);
    } catch (error) {
      const isCurrent = mountedRef.current && projectSessionRequestRef.current.get(projectId) === requestId;
      if (!silent && isCurrent) showApiError(error);
      if (!silent && isCurrent) {
        setProjectSessions((prev) => {
          const current = prev.get(projectId);
          return new Map(prev).set(projectId, {
            loading: false,
            loadingMore: false,
            items: current?.items ?? [],
            page: current?.page ?? 0,
            total: current?.total ?? 0,
          });
        });
      }
    } finally {
      if (projectSessionRequestRef.current.get(projectId) === requestId) {
        projectSessionBusyRef.current.delete(projectId);
      }
    }
  }, [onSyncSessionSummaries]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects, projectListVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (expandedProjectId !== null && (projectSessions.get(expandedProjectId)?.page ?? 0) <= 1) {
        void loadProjectSessions(expandedProjectId, 1, true);
      }
    }, PROJECT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [expandedProjectId, loadProjectSessions, projectSessions]);

  const toggleProject = (projectId: number) => {
    const nextProjectId = expandedProjectId === projectId ? null : projectId;
    setExpandedProjectId(nextProjectId);
    if (nextProjectId && !projectSessions.has(nextProjectId)) void loadProjectSessions(nextProjectId);
  };

  const createProjectSession = async (project: WorkProjectSummary) => {
    await submit(async () => {
      const response = await createWorkProjectSession(project.id);
      const sessionId = response.data?.session_id;
      if (!sessionId) return response;
      await loadProjectSessions(project.id);
      onSelect(sessionId);
      return response;
    });
  };

  const deleteProjectSession = async (projectId: number, sessionId: string) => {
    await submit(async () => {
      const response = await deleteWorkProjectSession(projectId, sessionId);
      onDropRuntime(sessionId);
      await loadProjectSessions(projectId);
      return response;
    });
  };

  const openRename = (target: RenameTarget) => {
    setRenameTarget(target);
    setRenameTitle(target.session.title || "");
  };

  const saveRename = async () => {
    const title = renameTitle.trim();
    if (!renameTarget || !title) return;
    await submit(async () => {
      const response = await updateAgentSessionTitle(renameTarget.session.session_id, { title });
      setRenameTarget(null);
      setRenameTitle("");
      if (renameTarget.projectId) {
        await loadProjectSessions(renameTarget.projectId, 1, true);
      } else {
        await onRefreshSessions();
      }
      return response;
    });
  };

  const showProjectInfo = (project: WorkProjectSummary) => {
    setInfoProjectId(project.id);
  };

  const empty = sessions.length === 0 && projects.length === 0;

  return (
    <div className="session-list">
      <div className="session-list-body">
        <AsyncContent
          loading={loading || projectsLoading}
          empty={empty}
          emptyContent={(
            <div className="session-empty">
              <MessageCircle size={28} />
              <p>No conversations yet.</p>
            </div>
          )}
          wrapperClassName="session-list-spin"
        >
          <>
            {sessions.map((session) => (
              <ChatSessionRow
                key={session.session_id}
                session={session}
                active={session.session_id === activeSessionId}
                onSelect={onSelect}
                onDelete={onDelete}
                onRename={(targetSession) => openRename({ session: targetSession })}
              />
            ))}
            {hasMore ? (
              <Button
                className="session-list-more"
                theme="borderless"
                type="tertiary"
                loading={loadingMore}
                onClick={() => void onLoadMoreSessions()}
              >
                Load more conversations
              </Button>
            ) : null}
            {projects.map((project) => (
              <ProjectGroup
                key={project.id}
                project={project}
                state={projectSessions.get(project.id)}
                expanded={expandedProjectId === project.id}
                activeSessionId={activeSessionId}
                onToggle={toggleProject}
                onShowInfo={showProjectInfo}
                onCreateSession={(targetProject) => void createProjectSession(targetProject)}
                onLoadMoreSessions={(projectId) => {
                  const state = projectSessions.get(projectId);
                  void loadProjectSessions(projectId, (state?.page ?? 0) + 1);
                }}
                onSelectSession={onSelect}
                onRenameSession={(targetSession, projectId) => openRename({ session: targetSession, projectId })}
                onDeleteSession={(projectId, sessionId) => void deleteProjectSession(projectId, sessionId)}
              />
            ))}
            {projects.length < projectsTotal ? (
              <Button
                className="session-list-more"
                theme="borderless"
                type="tertiary"
                loading={projectsLoadingMore}
                onClick={() => void loadMoreProjects()}
              >
                Load more projects
              </Button>
            ) : null}
          </>
        </AsyncContent>
      </div>
      <WorkProjectInfoModal
        open={infoProjectId !== null}
        projectId={infoProjectId}
        onClose={() => setInfoProjectId(null)}
      />
      <ResourceModal
        open={Boolean(renameTarget)}
        title="Edit Session Title"
        titleIcon={<Edit3 size={17} />}
        saving={renaming}
        submitLabel={UI_TEXT.save}
        submitDisabled={!renameTitle.trim()}
        onSubmit={saveRename}
        onCancel={() => setRenameTarget(null)}
      >
        <FormField label="Session Title">
          <Input
            autoFocus
            maxLength={80}
            value={renameTitle}
            onChange={setRenameTitle}
          />
        </FormField>
      </ResourceModal>
    </div>
  );
}

function ChatSessionRow({ session, active, onSelect, onDelete, onRename }: ChatSessionRowProps) {
  return (
    <SessionRow
      active={active}
      deleteConfirm={{
        title: "Delete chat",
        content: "Permanently delete this conversation?",
        onConfirm: () => onDelete(session.session_id),
      }}
      icon={<MessageCircle size={14} />}
      session={session}
      titleFallback="Untitled session"
      onRename={() => onRename(session)}
      onSelect={() => onSelect(session.session_id)}
    />
  );
}

function ProjectGroup({
  project,
  state,
  expanded,
  activeSessionId,
  onToggle,
  onShowInfo,
  onCreateSession,
  onLoadMoreSessions,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
}: ProjectGroupProps) {
  return (
    <div className="session-project-group">
      <div className="session-row session-row-project">
        <button type="button" className="session-row-main" onClick={() => onToggle(project.id)}>
          <span className="session-row-icon">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="session-row-body">
            <span className="session-row-title">{project.name}</span>
          </span>
        </button>
        <Button
          icon={<Info size={14} />}
          theme="borderless"
          type="tertiary"
          size="small"
          aria-label={`View ${project.name} details`}
          onClick={() => onShowInfo(project)}
        />
        <Button
          icon={<MessageSquarePlus size={14} />}
          theme="borderless"
          type="primary"
          size="small"
          disabled={!project.can_create_session}
          aria-label={`Create session for ${project.name}`}
          onClick={() => onCreateSession(project)}
        />
      </div>

      {expanded ? (
        <div className="session-project-children">
          {state?.loading ? <div className="session-project-empty">Loading sessions...</div> : null}
          {!state?.loading && (!state || state.items.length === 0) ? (
            <button
              type="button"
              className="session-project-empty"
              disabled={!project.can_create_session}
              onClick={() => onCreateSession(project)}
            >
              <FolderKanban size={14} />
              <span>New project session</span>
            </button>
          ) : null}
          {state?.items.map((session) => (
            <ProjectSessionRow
              key={session.session_id}
              session={session}
              projectId={project.id}
              active={session.session_id === activeSessionId}
              onSelect={onSelectSession}
              onRename={onRenameSession}
              onDelete={onDeleteSession}
            />
          ))}
          {state && state.items.length < state.total ? (
            <Button
              className="session-project-more"
              theme="borderless"
              type="tertiary"
              size="small"
              loading={state.loadingMore}
              onClick={() => onLoadMoreSessions(project.id)}
            >
              Load more
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProjectSessionRow({
  session,
  projectId,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: AgentSessionSummary;
  projectId: number;
  active: boolean;
  onSelect: (sessionId: string) => void;
  onRename: (session: AgentSessionSummary, projectId: number) => void;
  onDelete: (projectId: number, sessionId: string) => void;
}) {
  return (
    <SessionRow
      active={active}
      className="session-row-project-session"
      deleteConfirm={{
        title: "Delete session",
        content: "Permanently delete this project session?",
        onConfirm: () => onDelete(projectId, session.session_id),
      }}
      icon={<Play size={13} />}
      session={session}
      titleFallback="Project session"
      onRename={() => onRename(session, projectId)}
      onSelect={() => onSelect(session.session_id)}
    />
  );
}

function SessionRow({
  active,
  className,
  deleteConfirm,
  icon,
  session,
  titleFallback,
  onRename,
  onSelect,
}: SessionRowProps) {
  const title = session.title || titleFallback;
  const rowClassName = cx("session-row", className, active && "session-row-active");
  const deleteButton = (
    <Button
      icon={<Trash2 size={14} />}
      theme="borderless"
      type="danger"
      size="small"
      aria-label={`Delete ${session.title || session.session_id}`}
    />
  );

  return (
    <div className={rowClassName}>
      <button type="button" className="session-row-main" onClick={onSelect}>
        <span className="session-row-icon">{icon}</span>
        <span className="session-row-body">
          <span className="session-row-title">{title}</span>
        </span>
      </button>
      <Button
        icon={<Edit3 size={14} />}
        theme="borderless"
        type="tertiary"
        size="small"
        aria-label={`Edit ${session.title || session.session_id}`}
        onClick={onRename}
      />
      {deleteConfirm ? (
        <Popconfirm {...deleteConfirm} okType="danger" cancelText={UI_TEXT.cancel}>
          {deleteButton}
        </Popconfirm>
      ) : null}
    </div>
  );
}
