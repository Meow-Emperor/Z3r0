import { Select, Tag, Tooltip } from "@douyinfe/semi-ui";
import {
  Box,
  Boxes,
  Fingerprint,
  FolderOpen,
  Monitor,
  Network,
  Pause,
  Play,
  RotateCcw,
  Route,
  SquareStop,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { queryEgressProxies } from "../../shared/api/egressProxies";
import {
  canManageSandboxContainer,
  canOpenContainerNoVNC,
  deleteSandboxContainer,
  pauseSandboxContainer,
  querySandboxContainers,
  resumeSandboxContainer,
  startSandboxContainer,
  stopSandboxContainer,
  updateSandboxContainerEgress,
} from "../../shared/api/sandboxContainers";
import { SANDBOX_CONTAINER_EGRESS_MODE, SANDBOX_CONTAINER_STATUS, SANDBOX_CONTAINER_STATUS_VALUES } from "../../shared/api/generated/constants";
import type { EgressProxy, SandboxContainer, SandboxContainerEgressMode } from "../../shared/api/types";
import { FormField } from "../../shared/components/FormField";
import { PagedResourceTable } from "../../shared/components/PagedResourceTable";
import { OptionListSelect } from "../../shared/components/OptionListSelect";
import { ResourceModal } from "../../shared/components/ResourceModal";
import type { ResourceColumn } from "../../shared/components/ResourceTable";
import { DeleteRowAction, OwnerCell, ResourceIdentity, ResourceText, RowActionButton, RowActions } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { useOptionList } from "../../shared/hooks/useOptionList";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { countBy } from "../../shared/lib/array";
import { SANDBOX_CONTAINER_STATUS_COLOR, SANDBOX_CONTAINER_STATUS_LABEL } from "../../shared/lib/labels";
import { UI_TEXT } from "../../shared/lib/uiText";
import { egressProxyOption, sandboxEgressModeOptions } from "../../shared/lib/sandboxOptions";
import { useContainerShell } from "../container-shell/ContainerShellProvider";
import { SandboxContainerFormModal } from "./SandboxContainerFormModal";

export function SandboxContainersPage() {
  const containers = usePagedResourceList<SandboxContainer>({ query: querySandboxContainers });
  const [modalOpen, setModalOpen] = useState(false);
  const [egressModalContainer, setEgressModalContainer] = useState<SandboxContainer | null>(null);
  const { openFileManager, openNoVNC, openShell } = useContainerShell();

  const { run: startContainer, busyId: startingId } = useResourceAction<SandboxContainer>(
    (container) => startSandboxContainer(container.id), containers.loadItems,
  );
  const { run: stopContainer, busyId: stoppingId } = useResourceAction<SandboxContainer>(
    (container) => stopSandboxContainer(container.id), containers.loadItems,
  );
  const { run: pauseContainer, busyId: pausingId } = useResourceAction<SandboxContainer>(
    (container) => pauseSandboxContainer(container.id), containers.loadItems,
  );
  const { run: resumeContainer, busyId: resumingId } = useResourceAction<SandboxContainer>(
    (container) => resumeSandboxContainer(container.id), containers.loadItems,
  );
  const { run: deleteContainer, busyId: deletingId } = useResourceAction<SandboxContainer>(
    (container) => deleteSandboxContainer(container.id), containers.loadItems,
  );

  useAdminResourceHeader({
    createLabel: "Create Container",
    refreshLabel: "Refresh sandbox containers",
    loading: containers.loading,
    onCreate: () => setModalOpen(true),
    onRefresh: containers.loadItems,
  });

  const summary = useMemo(() => countBy(containers.items, SANDBOX_CONTAINER_STATUS_VALUES, (container) => container.status), [containers.items]);

  const columns: ResourceColumn<SandboxContainer>[] = [
    {
      key: "container", header: "Container", width: "minmax(0, 0.88fr)",
      render: (container) => (
        <ResourceIdentity
          icon={<Box size={18} />}
          title={container.container_name}
          detail={<span className="container-hash"><Fingerprint size={13} />{renderContainerHash(container.container_hash)}</span>}
        />
      ),
    },
    {
      key: "status", header: "Status", width: "84px",
      render: (container) => (
        <Tag color={SANDBOX_CONTAINER_STATUS_COLOR[container.status]}>{SANDBOX_CONTAINER_STATUS_LABEL[container.status]}</Tag>
      ),
    },
    {
      key: "host", header: "Host", width: "150px",
      render: (container) => <ResourceText title={container.host_ip_address}>{container.host_ip_address}</ResourceText>,
    },
    {
      key: "image", header: "Image", width: "minmax(0, 0.62fr)",
      render: (container) => <ResourceText title={container.image_name}>{container.image_name}</ResourceText>,
    },
    {
      key: "owner", header: "Owner", width: "minmax(0, 0.58fr)",
      render: (container) => <OwnerCell>{container.owner_username}</OwnerCell>,
    },
    {
      key: "ports", header: "Ports", width: "minmax(0, 0.56fr)",
      render: (container) => renderContainerPorts(container),
    },
    {
      key: "egress", header: "Egress", width: "minmax(0, 0.48fr)",
      render: (container) => (
        <Tag color={egressTagColor(container.egress_mode)}>{container.egress_label || container.egress_mode.toUpperCase()}</Tag>
      ),
    },
    { key: "updated", header: "Updated", width: "200px", render: (c) => formatDateTime(c.updated_at) },
    {
      key: "actions", header: "Actions", width: "256px",
      render: (container) => {
        const canManage = canManageSandboxContainer(container);
        return (
          <RowActions>
            <RowActionButton icon={<FolderOpen size={15} />} label={`Browse files for ${container.container_name}`}
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.RUNNING || container.control_proxy_host_port <= 0}
              onClick={() => openFileManager(container)}
            />
            <RowActionButton icon={<SquareTerminal size={15} />} label={`Connect shell for ${container.container_name}`}
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.RUNNING || container.control_proxy_host_port <= 0}
              onClick={() => openShell(container)}
            />
            <RowActionButton icon={<Monitor size={15} />} label={`Connect screen for ${container.container_name}`}
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.RUNNING || !canOpenContainerNoVNC(container)}
              onClick={() => openNoVNC(container)}
            />
            <RowActionButton icon={<Network size={15} />} label={`Set egress for ${container.container_name}`}
              disabled={!canManage || container.control_proxy_host_port <= 0}
              onClick={() => setEgressModalContainer(container)}
            />
            <RowActionButton icon={<Play size={15} />} label={`Start ${container.container_name}`} type="primary"
              disabled={!canManage || (container.status !== SANDBOX_CONTAINER_STATUS.CREATED && container.status !== SANDBOX_CONTAINER_STATUS.STOPPED)}
              loading={startingId === container.id}
              onClick={() => void startContainer(container)}
            />
            <RowActionButton icon={<SquareStop size={15} />} label={`Stop ${container.container_name}`} type="danger"
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.RUNNING} loading={stoppingId === container.id}
              onClick={() => void stopContainer(container)}
            />
            <RowActionButton icon={<Pause size={15} />} label={`Pause ${container.container_name}`}
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.RUNNING} loading={pausingId === container.id}
              onClick={() => void pauseContainer(container)}
            />
            <RowActionButton icon={<RotateCcw size={15} />} label={`Resume ${container.container_name}`} type="primary"
              disabled={!canManage || container.status !== SANDBOX_CONTAINER_STATUS.PAUSED} loading={resumingId === container.id}
              onClick={() => void resumeContainer(container)}
            />
            <DeleteRowAction title="Delete container" content={`Delete ${container.container_name}?`} label={`Delete ${container.container_name}`}
              disabled={!canManage} loading={deletingId === container.id} onConfirm={() => void deleteContainer(container)}
            />
          </RowActions>
        );
      },
    },
  ];

  return (
    <>
      <PagedResourceTable
        ariaLabel="Sandbox containers"
        className="sandbox-containers-table"
        columns={columns}
        rows={containers.items}
        rowKey={(container) => container.id}
        searchPlaceholder="Search container, image, owner, ports, or status"
        state={containers}
        metrics={[
          { label: "Total", value: containers.total },
          { label: "Running", value: summary[SANDBOX_CONTAINER_STATUS.RUNNING] },
          { label: "Paused", value: summary[SANDBOX_CONTAINER_STATUS.PAUSED] },
          { label: "Created", value: summary[SANDBOX_CONTAINER_STATUS.CREATED] },
          { label: "Stopped", value: summary[SANDBOX_CONTAINER_STATUS.STOPPED] },
        ]}
        emptyIcon={<Boxes size={42} />}
        emptyTitle="No containers found"
      />

      <SandboxContainerFormModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onCreated={async () => {
          setModalOpen(false);
          await containers.loadItems();
        }}
      />
      <ContainerEgressModal
        container={egressModalContainer}
        onClose={() => setEgressModalContainer(null)}
        onSaved={async () => {
          setEgressModalContainer(null);
          await containers.loadItems();
        }}
      />
    </>
  );
}

function ContainerEgressModal({
  container,
  onClose,
  onSaved,
}: {
  container: SandboxContainer | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const egressProxyOptions = useOptionList<EgressProxy>({ enabled: Boolean(container), query: queryEgressProxies });
  const [egressMode, setEgressMode] = useState<SandboxContainerEgressMode>(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
  const [selectedProxyId, setSelectedProxyId] = useState<number | undefined>();
  const { saving, submit } = useResourceSubmit({ onSuccess: onSaved });

  useEffect(() => {
    setEgressMode(container?.egress_mode ?? SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
    setSelectedProxyId(container?.egress_proxy_id ?? undefined);
  }, [container]);

  const save = () => {
    if (!container) return;
    void submit(() => updateSandboxContainerEgress(container.id, {
        egress_mode: egressMode,
        egress_proxy_id: egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? selectedProxyId : undefined,
      }));
  };

  return (
    <ResourceModal
      title={container ? `Egress: ${container.container_name}` : "Egress"}
      titleIcon={<Route size={17} />}
      open={Boolean(container)}
      saving={saving}
      submitLabel={UI_TEXT.save}
      submitDisabled={egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY && !selectedProxyId}
      onSubmit={save}
      onCancel={onClose}
    >
      <FormField label="Egress Mode">
        <Select
          prefix={<Route size={16} />}
          value={egressMode}
          optionList={sandboxEgressModeOptions({ includeProxy: true, supportsTor: Boolean(container?.supports_tor) })}
          onChange={(value) => {
            if (typeof value !== "string") return;
            const next = value as SandboxContainerEgressMode;
            setEgressMode(next);
            if (next !== SANDBOX_CONTAINER_EGRESS_MODE.PROXY) setSelectedProxyId(undefined);
          }}
        />
      </FormField>
      {egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? (
        <FormField label="Managed Proxy">
          <OptionListSelect
            source={egressProxyOptions}
            prefix={<Network size={16} />}
            value={selectedProxyId}
            placeholder="Select an egress proxy"
            emptyContent="No egress proxies"
            optionList={egressProxyOptions.items.map(egressProxyOption)}
            onChange={(value) => setSelectedProxyId(typeof value === "number" ? value : undefined)}
          />
        </FormField>
      ) : null}
    </ResourceModal>
  );
}

function renderContainerHash(containerHash: string) {
  if (!containerHash) return <>Pending create</>;
  return <Tooltip content={containerHash}>{containerHash.slice(0, 12)}</Tooltip>;
}

function renderContainerPorts(container: SandboxContainer) {
  return (
    <div className="port-mapping-list">
      <Tag color="green">
        control {container.control_proxy_host_port}:{container.control_proxy_port}/tcp
      </Tag>
      {container.port_mappings.map((mapping) => (
        <Tag key={`${mapping.host_port}-${mapping.container_port}-${mapping.protocol}`} color="blue">
          {mapping.host_port}:{mapping.container_port}/{mapping.protocol}
        </Tag>
      ))}
    </div>
  );
}

function egressTagColor(mode: SandboxContainerEgressMode) {
  if (mode === SANDBOX_CONTAINER_EGRESS_MODE.TOR) return "violet";
  if (mode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY) return "blue";
  return "grey";
}
