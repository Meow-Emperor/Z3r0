import { Button, Popconfirm, Tooltip } from "@douyinfe/semi-ui";
import {
  Activity,
  Box,
  FolderKanban,
  FolderOpen,
  Monitor,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SquareStop,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAdminHeaderActions } from "../../app/layouts/AdminLayout";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import { SANDBOX_CONTAINER_STATUS } from "../../shared/api/generated/constants";
import {
  canManageSandboxContainer,
  canOpenContainerNoVNC,
  deleteSandboxContainer,
  pauseSandboxContainer,
  queryAvailableSandboxContainers,
  resumeSandboxContainer,
  startSandboxContainer,
  stopSandboxContainer,
} from "../../shared/api/sandboxContainers";
import type { AgentInputPart, SandboxContainer } from "../../shared/api/types";
import { getWorkProjectRecordSnapshot } from "../../shared/api/workProjects";
import { cx } from "../../shared/lib/className";
import { UI_TEXT } from "../../shared/lib/uiText";
import { useContainerShell } from "../container-shell/ContainerShellProvider";
import { WorkProjectInfoModal } from "../work-projects/WorkProjectInfoModal";
import { useAgentSessionContext } from "./AgentSessionProvider";
import { ChatStream } from "./ChatStream";
import { Composer } from "./Composer";
import { MessageScrollPanel } from "./MessageScrollPanel";
import { PlaygroundSandboxCreateModal } from "./PlaygroundSandboxCreateModal";
import { SandboxSelector } from "./SandboxSelector";
import { SubagentSidePanel } from "./SubagentSidePanel";
import { useSubagentPanel } from "./useSubagentPanel";

type PlaygroundLocationState = { sessionId?: string };

type SandboxActionButtonProps = {
  ariaLabel: string;
  disabled: boolean;
  icon: ReactNode;
  loading?: boolean;
  tooltip: string;
  onClick: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Live",
  connecting: "Connecting",
  closed: "Disconnected",
  idle: "Idle",
};

export function PlaygroundPage() {
  const setHeaderActions = useAdminHeaderActions();
  const {
    activeSessionId, activeSessionSummary, selectSession,
    refreshSessions,
    chatState, status, historyLoading, historyHasMore, historyPrepending, historyVersion,
    agents, defaultAgentCode, activeAgentCode, setActiveAgentCode,
    send, updateSelectedSandboxContainer, interrupt, cancelAll, loadPreviousHistory,
  } = useAgentSessionContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [availableSandboxContainers, setAvailableSandboxContainers] = useState<SandboxContainer[]>([]);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxContainerId, setSandboxContainerId] = useState<number | null>(null);
  const [projectSandboxContainerId, setProjectSandboxContainerId] = useState<number | null>(null);
  const [projectSandboxContainer, setProjectSandboxContainer] = useState<SandboxContainer | null>(null);
  const [projectSandboxScopeLoaded, setProjectSandboxScopeLoaded] = useState(false);
  const [projectRecordsOpen, setProjectRecordsOpen] = useState(false);
  const [createSandboxOpen, setCreateSandboxOpen] = useState(false);
  const [sandboxAction, setSandboxAction] = useState<string | null>(null);
  const { openFileManager, openNoVNC, openShell, syncContainerWindows } = useContainerShell();
  const { selectedSubagent, setSelectedSubagent, subagentTabs, closeSubagentPanel } = useSubagentPanel(chatState, activeSessionId);
  const hasRunningSubagents = subagentTabs.some((tab) => tab.status === "running");
  const agentSwitchDisabled = activeAgentCode === defaultAgentCode && hasRunningSubagents;

  const activeProjectId = activeSessionSummary?.session_type === "project" ? activeSessionSummary.project_id ?? null : null;
  const currentProjectSandboxContainer = useMemo(() => {
    if (!activeProjectId) return null;
    if (projectSandboxContainerId === null) return projectSandboxContainer;
    return findSandboxContainerById(availableSandboxContainers, projectSandboxContainerId) ?? projectSandboxContainer;
  }, [activeProjectId, availableSandboxContainers, projectSandboxContainer, projectSandboxContainerId]);
  const selectableSandboxContainers = useMemo(() => {
    if (activeProjectId) return currentProjectSandboxContainer ? [currentProjectSandboxContainer] : [];
    return availableSandboxContainers;
  }, [activeProjectId, availableSandboxContainers, currentProjectSandboxContainer]);
  const selectedSandboxContainer = useMemo(
    () => findSandboxContainerById(selectableSandboxContainers, sandboxContainerId),
    [sandboxContainerId, selectableSandboxContainers],
  );
  const sandboxAccessUnavailableReason = getSandboxAccessUnavailableReason(selectedSandboxContainer);
  const sandboxManageUnavailableReason = sandboxAccessUnavailableReason ? "No permission to operate this sandbox" : null;
  const shellUnavailableReason = sandboxAccessUnavailableReason
    ?? getSandboxActionUnavailableReason(selectedSandboxContainer, { requiresControlProxy: true });
  const screenUnavailableReason = sandboxAccessUnavailableReason
    ?? getSandboxActionUnavailableReason(selectedSandboxContainer, { requiresNoVNC: true });
  const selectedSandboxName = selectedSandboxContainer?.container_name ?? "selected sandbox";
  const selectedSandboxActionId = selectedSandboxContainer?.id ?? 0;
  const canStartSelectedSandbox = Boolean(!sandboxManageUnavailableReason && selectedSandboxContainer && (
    selectedSandboxContainer.status === SANDBOX_CONTAINER_STATUS.CREATED
    || selectedSandboxContainer.status === SANDBOX_CONTAINER_STATUS.STOPPED
  ));
  const canStopSelectedSandbox = !sandboxManageUnavailableReason
    && selectedSandboxContainer?.status === SANDBOX_CONTAINER_STATUS.RUNNING;
  const canPauseSelectedSandbox = !sandboxManageUnavailableReason
    && selectedSandboxContainer?.status === SANDBOX_CONTAINER_STATUS.RUNNING;
  const canResumeSelectedSandbox = !sandboxManageUnavailableReason
    && selectedSandboxContainer?.status === SANDBOX_CONTAINER_STATUS.PAUSED;
  const openProjectRecords = useCallback(() => {
    setProjectRecordsOpen(true);
  }, []);
  const openSubagentPanel = useCallback(() => {
    const tab = [...subagentTabs].reverse().find((item) => item.status === "running") ?? subagentTabs[subagentTabs.length - 1];
    if (tab) setSelectedSubagent(tab.agentCode);
  }, [setSelectedSubagent, subagentTabs]);

  const openSelectedFileManager = useCallback(() => {
    if (selectedSandboxContainer) openFileManager(selectedSandboxContainer);
  }, [openFileManager, selectedSandboxContainer]);

  const openSelectedShell = useCallback(() => {
    if (selectedSandboxContainer) openShell(selectedSandboxContainer);
  }, [openShell, selectedSandboxContainer]);

  const openSelectedNoVNC = useCallback(() => {
    if (selectedSandboxContainer) openNoVNC(selectedSandboxContainer);
  }, [openNoVNC, selectedSandboxContainer]);

  const loadSandboxes = useCallback(async () => {
    setSandboxLoading(true);
    try {
      const availableResponse = await queryAvailableSandboxContainers({
        page: 1,
        size: 100,
        keyword: "",
        work_project_id: activeProjectId ?? undefined,
        include_non_running: true,
      });
      setAvailableSandboxContainers(availableResponse.data?.items ?? []);
    } catch (error) {
      showApiError(error);
    } finally {
      setSandboxLoading(false);
    }
  }, [activeProjectId]);

  // consume sessionId from navigate state (e.g. project "Go") then clear so
  // back-navigation does not retrigger the jump
  useEffect(() => {
    const incoming = (location.state as PlaygroundLocationState | null)?.sessionId;
    if (incoming) {
      selectSession(incoming);
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate, selectSession]);

  useEffect(() => {
    void loadSandboxes();
  }, [loadSandboxes]);

  useEffect(() => {
    setSandboxContainerId(activeSessionSummary?.selected_sandbox_container_id ?? null);
  }, [activeSessionSummary?.selected_sandbox_container_id]);

  useEffect(() => {
    syncContainerWindows(selectedSandboxContainer);
  }, [
    activeSessionId,
    selectedSandboxContainer?.id,
    selectedSandboxContainer?.control_proxy_host_port,
    selectedSandboxContainer?.status,
    syncContainerWindows,
  ]);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectSandboxContainerId(null);
      setProjectSandboxContainer(null);
      setProjectSandboxScopeLoaded(false);
      return;
    }
    let active = true;
    setProjectSandboxContainerId(null);
    setProjectSandboxContainer(null);
    setProjectSandboxScopeLoaded(false);
    getWorkProjectRecordSnapshot(activeProjectId)
      .then((response) => {
        if (!active) return;
        const project = response.data?.project;
        const containerId = project?.sandbox_container_id ?? null;
        setProjectSandboxContainerId(containerId);
        setProjectSandboxContainer(project?.sandbox_container ?? null);
        setSandboxContainerId(containerId);
        setProjectSandboxScopeLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        setProjectSandboxContainerId(null);
        setProjectSandboxContainer(null);
        setProjectSandboxScopeLoaded(true);
        showApiError(error);
      });
    return () => {
      active = false;
    };
  }, [activeProjectId]);

  const changeSandboxContainer = useCallback(async (nextContainerId: number | null) => {
    const nextContainer = findSandboxContainerById(selectableSandboxContainers, nextContainerId);
    if (!activeSessionId) {
      setSandboxContainerId(nextContainerId);
      syncContainerWindows(nextContainer);
      return;
    }
    try {
      const summary = await updateSelectedSandboxContainer(activeSessionId, nextContainerId);
      const selectedId = summary?.selected_sandbox_container_id ?? null;
      setSandboxContainerId(selectedId);
      syncContainerWindows(findSandboxContainerById(selectableSandboxContainers, selectedId));
    } catch (error) {
      showApiError(error);
    }
  }, [activeSessionId, selectableSandboxContainers, syncContainerWindows, updateSelectedSandboxContainer]);

  const handleSandboxCreated = useCallback((container: SandboxContainer) => {
    setCreateSandboxOpen(false);
    setAvailableSandboxContainers((current) => upsertSandboxContainer(current, container));
    if (!activeProjectId) {
      setSandboxContainerId(container.id);
      syncContainerWindows(container);
    }
    void loadSandboxes();
  }, [activeProjectId, loadSandboxes, syncContainerWindows]);

  const runSandboxMutation = useCallback(async (
    action: "start" | "stop" | "pause" | "resume",
    container: SandboxContainer | null,
  ) => {
    if (!container) return;
    const actionKey = `${action}:${container.id}`;
    setSandboxAction(actionKey);
    try {
      const response = action === "start"
        ? await startSandboxContainer(container.id)
        : action === "stop"
          ? await stopSandboxContainer(container.id)
          : action === "pause"
            ? await pauseSandboxContainer(container.id)
            : await resumeSandboxContainer(container.id);
      showApiSuccess(response);
      const updatedContainer = response.data;
      if (updatedContainer) {
        setAvailableSandboxContainers((current) => upsertSandboxContainer(current, updatedContainer));
        if (updatedContainer.id === projectSandboxContainerId) setProjectSandboxContainer(updatedContainer);
        setSandboxContainerId(updatedContainer.id);
        syncContainerWindows(updatedContainer);
      }
      await loadSandboxes();
    } catch (error) {
      showApiError(error);
    } finally {
      setSandboxAction(null);
    }
  }, [loadSandboxes, projectSandboxContainerId, syncContainerWindows]);

  const deleteSelectedSandboxContainer = useCallback(async () => {
    if (!selectedSandboxContainer) return;
    const actionKey = `delete:${selectedSandboxContainer.id}`;
    setSandboxAction(actionKey);
    try {
      const response = await deleteSandboxContainer(selectedSandboxContainer.id);
      showApiSuccess(response);
      setAvailableSandboxContainers((current) => current.filter((container) => container.id !== selectedSandboxContainer.id));
      if (projectSandboxContainerId === selectedSandboxContainer.id) {
        setProjectSandboxContainerId(null);
        setProjectSandboxContainer(null);
      }
      setSandboxContainerId(null);
      syncContainerWindows(null);
      await Promise.all([loadSandboxes(), refreshSessions()]);
    } catch (error) {
      showApiError(error);
    } finally {
      setSandboxAction(null);
    }
  }, [loadSandboxes, projectSandboxContainerId, refreshSessions, selectedSandboxContainer, syncContainerWindows]);

  useEffect(() => {
    if (activeSessionSummary?.session_type === "project" && projectSandboxScopeLoaded) {
      setSandboxContainerId(projectSandboxContainerId);
    }
  }, [activeSessionSummary?.session_type, projectSandboxContainerId, projectSandboxScopeLoaded]);

  const headerNode = useMemo(() => (
    <>
      <SandboxSelector
        containers={selectableSandboxContainers}
        loading={sandboxLoading}
        value={sandboxContainerId}
        className="sandbox-selector-topbar"
        disabled={Boolean(activeProjectId)}
        onChange={(id) => void changeSandboxContainer(id)}
      />
      <div className="sandbox-container-actions" aria-label="Selected sandbox actions">
        <SandboxActionButton
          ariaLabel="Create sandbox container"
          disabled={Boolean(activeProjectId)}
          icon={<Box size={15} />}
          tooltip={activeProjectId ? "Project sessions use the project's bound sandbox" : "Create sandbox container"}
          onClick={() => setCreateSandboxOpen(true)}
        />
        <SandboxActionButton
          ariaLabel={`Start ${selectedSandboxName}`}
          disabled={!canStartSelectedSandbox}
          icon={<Play size={15} />}
          loading={sandboxAction === `start:${selectedSandboxActionId}`}
          tooltip={sandboxManageUnavailableReason ?? (canStartSelectedSandbox ? `Start ${selectedSandboxName}` : "Select a created or stopped sandbox")}
          onClick={() => void runSandboxMutation("start", selectedSandboxContainer)}
        />
        <SandboxActionButton
          ariaLabel={`Stop ${selectedSandboxName}`}
          disabled={!canStopSelectedSandbox}
          icon={<SquareStop size={15} />}
          loading={sandboxAction === `stop:${selectedSandboxActionId}`}
          tooltip={sandboxManageUnavailableReason ?? (canStopSelectedSandbox ? `Stop ${selectedSandboxName}` : "Select a running sandbox")}
          onClick={() => void runSandboxMutation("stop", selectedSandboxContainer)}
        />
        <SandboxActionButton
          ariaLabel={`Pause ${selectedSandboxName}`}
          disabled={!canPauseSelectedSandbox}
          icon={<Pause size={15} />}
          loading={sandboxAction === `pause:${selectedSandboxActionId}`}
          tooltip={sandboxManageUnavailableReason ?? (canPauseSelectedSandbox ? `Pause ${selectedSandboxName}` : "Select a running sandbox")}
          onClick={() => void runSandboxMutation("pause", selectedSandboxContainer)}
        />
        <SandboxActionButton
          ariaLabel={`Resume ${selectedSandboxName}`}
          disabled={!canResumeSelectedSandbox}
          icon={<RotateCcw size={15} />}
          loading={sandboxAction === `resume:${selectedSandboxActionId}`}
          tooltip={sandboxManageUnavailableReason ?? (canResumeSelectedSandbox ? `Resume ${selectedSandboxName}` : "Select a paused sandbox")}
          onClick={() => void runSandboxMutation("resume", selectedSandboxContainer)}
        />
        <Popconfirm
          title="Delete container"
          content={selectedSandboxContainer ? `Delete ${selectedSandboxContainer.container_name}?` : "Select a sandbox first"}
          okType="danger"
          cancelText={UI_TEXT.cancel}
          onConfirm={() => void deleteSelectedSandboxContainer()}
        >
          <span>
            <SandboxActionButton
              ariaLabel={`Delete ${selectedSandboxName}`}
              disabled={!selectedSandboxContainer || Boolean(sandboxManageUnavailableReason)}
              icon={<Trash2 size={15} />}
              loading={sandboxAction === `delete:${selectedSandboxActionId}`}
              tooltip={sandboxManageUnavailableReason ?? (selectedSandboxContainer ? `Delete ${selectedSandboxName}` : "Select a sandbox first")}
              onClick={() => undefined}
            />
          </span>
        </Popconfirm>
        <SandboxActionButton
          ariaLabel={`Open terminal for ${selectedSandboxName}`}
          disabled={Boolean(shellUnavailableReason)}
          icon={<SquareTerminal size={15} />}
          tooltip={shellUnavailableReason ?? `Open terminal for ${selectedSandboxName}`}
          onClick={openSelectedShell}
        />
        <SandboxActionButton
          ariaLabel={`Open screen for ${selectedSandboxName}`}
          disabled={Boolean(screenUnavailableReason)}
          icon={<Monitor size={15} />}
          tooltip={screenUnavailableReason ?? `Open screen for ${selectedSandboxName}`}
          onClick={openSelectedNoVNC}
        />
        <SandboxActionButton
          ariaLabel={`Browse files for ${selectedSandboxName}`}
          disabled={Boolean(shellUnavailableReason)}
          icon={<FolderOpen size={15} />}
          tooltip={shellUnavailableReason ?? `Browse files for ${selectedSandboxName}`}
          onClick={openSelectedFileManager}
        />
        {activeProjectId ? (
          <SandboxActionButton
            ariaLabel="Open project info"
            disabled={false}
            icon={<FolderKanban size={15} />}
            tooltip="Project info"
            onClick={openProjectRecords}
          />
        ) : null}
        <SandboxActionButton
          ariaLabel="Open subagent panel"
          disabled={subagentTabs.length === 0}
          icon={<PanelRightOpen size={15} />}
          tooltip={subagentTabs.length > 0 ? "Open subagent panel" : "No subagent messages"}
          onClick={openSubagentPanel}
        />
      </div>
      <Button icon={<Plus size={16} />} theme="solid" type="primary" onClick={() => selectSession(null)}>
        New chat
      </Button>
      <span className={cx("stream-status", `stream-status-${status}`)}>
        <Activity size={14} />
        <span>{STATUS_LABEL[status] ?? "Idle"}</span>
      </span>
    </>
  ), [
    activeProjectId,
    canPauseSelectedSandbox,
    canResumeSelectedSandbox,
    canStartSelectedSandbox,
    canStopSelectedSandbox,
    changeSandboxContainer,
    deleteSelectedSandboxContainer,
    openProjectRecords,
    openSelectedFileManager,
    openSelectedNoVNC,
    openSelectedShell,
    openSubagentPanel,
    runSandboxMutation,
    sandboxAction,
    sandboxManageUnavailableReason,
    sandboxContainerId,
    selectableSandboxContainers,
    sandboxLoading,
    screenUnavailableReason,
    selectSession,
    selectedSandboxActionId,
    selectedSandboxContainer,
    selectedSandboxName,
    shellUnavailableReason,
    status,
    subagentTabs.length,
  ]);

  useLayoutEffect(() => {
    setHeaderActions(headerNode);
    return () => setHeaderActions(null);
  }, [headerNode, setHeaderActions]);

  const handleSend = async (content: AgentInputPart[]) => {
    try {
      await send(content, activeSessionId, sandboxContainerId);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className={cx("playground-shell", selectedSubagent && "playground-shell-split")}>
      <div className="playground-main">
        <div className="playground-conversation-frame">
          <div className="playground-main-column">
            <MessageScrollPanel
              ariaLabel="Conversation messages"
              className="playground-canvas-shell"
              contentClassName="playground-canvas"
              loading={historyLoading}
              loadingPrevious={historyPrepending}
              onLoadPrevious={historyHasMore && !historyPrepending ? () => void loadPreviousHistory() : undefined}
              preserveScrollKey={historyVersion}
              resetKey={activeSessionId ?? "new-chat"}
              scrollButtonClassName="chat-scroll-tail-floating"
              watch={[chatState.nodes, chatState.streaming]}
            >
              {(tailRef) => (
                <ChatStream
                  nodes={chatState.nodes}
                  streaming={chatState.streaming}
                  agents={agents}
                  selectedSubagent={selectedSubagent}
                  tailRef={tailRef}
                  onOpenSubagent={setSelectedSubagent}
                />
              )}
            </MessageScrollPanel>
            <div className="playground-composer">
              <Composer
                streaming={chatState.streaming}
                disabled={historyLoading}
                agents={agents}
                activeAgentCode={activeAgentCode}
                agentSwitchDisabled={agentSwitchDisabled}
                canCancelAll={hasRunningSubagents}
                onPickAgent={setActiveAgentCode}
                onSend={handleSend}
                onInterrupt={() => void interrupt()}
                onCancelAll={() => void cancelAll()}
              />
            </div>
          </div>
          <SubagentSidePanel
            nodes={chatState.nodes}
            tabs={subagentTabs}
            agents={agents}
            selection={selectedSubagent}
            onSelect={setSelectedSubagent}
            onClose={closeSubagentPanel}
          />
        </div>
      </div>
      <WorkProjectInfoModal
        open={projectRecordsOpen && Boolean(activeProjectId)}
        projectId={activeProjectId}
        initialTab="assets"
        onClose={() => setProjectRecordsOpen(false)}
      />
      <PlaygroundSandboxCreateModal
        open={createSandboxOpen}
        onCancel={() => setCreateSandboxOpen(false)}
        onCreated={handleSandboxCreated}
      />
    </div>
  );
}

function SandboxActionButton({ ariaLabel, disabled, icon, loading = false, onClick, tooltip }: SandboxActionButtonProps) {
  return (
    <Tooltip content={tooltip}>
      <span className="sandbox-action-tooltip">
        <Button
          aria-label={ariaLabel}
          className="sandbox-action-button"
          disabled={disabled}
          icon={icon}
          loading={loading}
          theme="borderless"
          type="tertiary"
          onClick={onClick}
        />
      </span>
    </Tooltip>
  );
}

function getSandboxActionUnavailableReason(
  container: SandboxContainer | null,
  options: { requiresControlProxy?: boolean; requiresNoVNC?: boolean },
) {
  if (!container) return "Select a sandbox first";
  if (container.status !== SANDBOX_CONTAINER_STATUS.RUNNING) return "Selected sandbox is not running";
  if (options.requiresControlProxy && container.control_proxy_host_port <= 0) return "Selected sandbox control port is not ready";
  if (options.requiresNoVNC && !canOpenContainerNoVNC(container)) return "Selected sandbox has no noVNC screen";
  return null;
}

function getSandboxAccessUnavailableReason(
  container: SandboxContainer | null,
) {
  if (!container) return null;
  if (canManageSandboxContainer(container)) return null;
  return "No permission to access this sandbox";
}

function upsertSandboxContainer(containers: SandboxContainer[], nextContainer: SandboxContainer) {
  if (!containers.some((container) => container.id === nextContainer.id)) {
    return [nextContainer, ...containers];
  }
  return containers.map((container) => (
    container.id === nextContainer.id ? nextContainer : container
  ));
}

function findSandboxContainerById(containers: SandboxContainer[], id: number | null) {
  if (id === null) return null;
  return containers.find((container) => container.id === id) ?? null;
}
