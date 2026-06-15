import { Button, Popconfirm, Tag, Tooltip } from "@douyinfe/semi-ui";
import { Box, Boxes, Fingerprint, FolderOpen, Monitor, Play, Square, SquareTerminal, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canOpenContainerNoVNC, createSandboxContainer, deleteSandboxContainer, querySandboxContainers, startSandboxContainer, stopSandboxContainer } from "../../shared/api/sandboxContainers";
import { queryManagedHosts } from "../../shared/api/hosts";
import { querySandboxImages } from "../../shared/api/sandboxImages";
import { querySystemUsers } from "../../shared/api/systemUsers";
import { showApiError } from "../../shared/api/feedback";
import type { CreateSandboxContainerRequest, ManagedHost, SandboxContainer, SandboxImage, SystemUser } from "../../shared/api/types";
import { ResourcePageShell } from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { useAuth } from "../../shared/auth/AuthProvider";
import { formatDateTime } from "../../shared/lib/date";
import { SANDBOX_CONTAINER_STATUS_COLOR, SANDBOX_CONTAINER_STATUS_LABEL } from "../../shared/lib/labels";
import { useContainerShell } from "../container-shell/ContainerShellProvider";
import { SandboxContainerFormModal } from "./SandboxContainerFormModal";

export function SandboxContainersPage() {
  const { user } = useAuth();
  const {
    items: containers, page, keyword, loading, loadItems: loadContainers, total, rangeStart, rangeEnd,
    setKeyword, search, previous, next, canGoBack, canGoNext,
  } = usePagedResourceList<SandboxContainer>({ query: querySandboxContainers });
  const [modalOpen, setModalOpen] = useState(false);
  const [images, setImages] = useState<SandboxImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [hosts, setHosts] = useState<ManagedHost[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const { openFileManager, openNoVNC, openShell } = useContainerShell();

  const loadReadyImages = useCallback(async () => {
    setImagesLoading(true);
    try {
      const response = await querySandboxImages({ page: 1, size: 100, keyword: "" });
      setImages(response.data?.items || []);
    } catch (error) {
      showApiError(error);
    } finally {
      setImagesLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await querySystemUsers({ page: 1, size: 100, keyword: "" });
      setUsers(response.data?.items || []);
    } catch (error) {
      showApiError(error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadHosts = useCallback(async () => {
    setHostsLoading(true);
    try {
      const response = await queryManagedHosts({ page: 1, size: 100, keyword: "" });
      setHosts(response.data?.items || []);
    } catch (error) {
      showApiError(error);
    } finally {
      setHostsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadContainers();
    await loadReadyImages();
    await loadHosts();
    await loadUsers();
  }, [loadContainers, loadReadyImages, loadHosts, loadUsers]);

  const { run: startContainer, busyId: startingId } = useResourceAction<SandboxContainer>(
    (container) => startSandboxContainer(container.id), loadContainers,
  );
  const { run: stopContainer, busyId: stoppingId } = useResourceAction<SandboxContainer>(
    (container) => stopSandboxContainer(container.id), loadContainers,
  );
  const { run: deleteContainer, busyId: deletingId } = useResourceAction<SandboxContainer>(
    (container) => deleteSandboxContainer(container.id), loadContainers,
  );

  useEffect(() => {
    void loadReadyImages();
    void loadHosts();
    void loadUsers();
  }, [loadReadyImages, loadHosts, loadUsers]);

  useAdminResourceHeader({
    createLabel: "Create Container",
    refreshLabel: "Refresh sandbox containers",
    loading: loading || imagesLoading || hostsLoading || usersLoading,
    onCreate: () => setModalOpen(true),
    onRefresh: refreshAll,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModalOpen(false);
      await loadContainers();
    },
  });

  const summary = useMemo(
    () => containers.reduce(
      (acc, container) => ({
        running: acc.running + (container.status === "running" ? 1 : 0),
        created: acc.created + (container.status === "created" ? 1 : 0),
        stopped: acc.stopped + (container.status === "stopped" ? 1 : 0),
      }),
      { running: 0, created: 0, stopped: 0 },
    ),
    [containers],
  );

  const handleCreate = (payload: CreateSandboxContainerRequest) => submit(() => createSandboxContainer(payload));

  const columns: ResourceColumn<SandboxContainer>[] = [
    {
      key: "container", header: "Container", width: "minmax(0, 0.62fr)",
      render: (container) => (
        <div className="container-identity">
          <div className="resource-avatar"><Box size={18} /></div>
          <div>
            <strong>{container.container_name}</strong>
            <span><Fingerprint size={13} />{renderContainerHash(container.container_hash)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", width: "84px",
      render: (container) => (
        <Tag color={SANDBOX_CONTAINER_STATUS_COLOR[container.status]}>{SANDBOX_CONTAINER_STATUS_LABEL[container.status]}</Tag>
      ),
    },
    {
      key: "host", header: "Host", width: "minmax(0, 0.48fr)",
      render: (container) => <div className="resource-description" title={container.host_ip_address}>{container.host_ip_address}</div>,
    },
    {
      key: "image", header: "Image", width: "minmax(0, 0.62fr)",
      render: (container) => <div className="resource-description" title={container.image_name}>{container.image_name}</div>,
    },
    {
      key: "owner", header: "Owner", width: "minmax(0, 0.48fr)",
      render: (container) => <span className="owner-cell"><User size={13} />{container.owner_username}</span>,
    },
    {
      key: "proxy", header: "Proxy", width: "96px",
      render: (container) => container.proxy_host_port || "-",
    },
    {
      key: "ports", header: "Ports", width: "minmax(0, 0.56fr)",
      render: (container) => renderPortMappings(container),
    },
    { key: "updated", header: "Updated", width: "180px", render: (c) => formatDateTime(c.updated_at) },
    {
      key: "actions", header: "Actions", width: "150px",
      render: (container) => (
        <div className="row-actions">
          <Button icon={<FolderOpen size={15} />} theme="borderless"
            disabled={container.status !== "running" || container.proxy_host_port <= 0}
            aria-label={`Browse files for ${container.container_name}`} onClick={() => openFileManager(container)}
          />
          <Button icon={<SquareTerminal size={15} />} theme="borderless"
            disabled={container.status !== "running" || container.proxy_host_port <= 0}
            aria-label={`Connect shell for ${container.container_name}`} onClick={() => openShell(container)}
          />
          <Button icon={<Monitor size={15} />} theme="borderless"
            disabled={container.status !== "running" || !canOpenContainerNoVNC(container)}
            aria-label={`Connect screen for ${container.container_name}`} onClick={() => openNoVNC(container)}
          />
          <Button icon={<Play size={15} />} theme="borderless" type="primary"
            disabled={container.status !== "created" && container.status !== "stopped"}
            loading={startingId === container.id}
            aria-label={`Start ${container.container_name}`} onClick={() => void startContainer(container)}
          />
          <Button icon={<Square size={15} />} theme="borderless"
            disabled={container.status !== "running"} loading={stoppingId === container.id}
            aria-label={`Stop ${container.container_name}`} onClick={() => void stopContainer(container)}
          />
          <Popconfirm title="Delete container" content={`Delete ${container.container_name}?`} okType="danger" onConfirm={() => void deleteContainer(container)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingId === container.id} aria-label={`Delete ${container.container_name}`}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <>
      <ResourcePageShell
        searchPlaceholder="Search container, image, owner, ports, or status"
        keyword={keyword}
        loading={loading}
        metrics={[
          { label: "Total", value: total },
          { label: "Running", value: summary.running },
          { label: "Created", value: summary.created },
          { label: "Stopped", value: summary.stopped },
        ]}
        empty={containers.length === 0}
        emptyIcon={<Boxes size={42} />}
        emptyTitle="No containers found"
        page={page}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        onKeywordChange={setKeyword}
        onSearch={search}
        onPrevious={previous}
        onNext={next}
      >
        <ResourceTable<SandboxContainer>
          ariaLabel="Sandbox containers"
          className="sandbox-containers-table"
          columns={columns}
          rows={containers}
          rowKey={(container) => container.id}
        />
      </ResourcePageShell>

      <SandboxContainerFormModal
        open={modalOpen}
        saving={saving}
        images={images}
        imagesLoading={imagesLoading}
        hosts={hosts}
        hostsLoading={hostsLoading}
        users={users}
        usersLoading={usersLoading}
        currentUserId={user?.id ?? 0}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  );
}

function renderContainerHash(containerHash: string) {
  if (!containerHash) return <>Pending create</>;
  return <Tooltip content={containerHash}>{containerHash.slice(0, 12)}</Tooltip>;
}

function renderPortMappings(container: SandboxContainer) {
  if (container.port_mappings.length === 0) {
    return <span className="resource-description">No exposed ports</span>;
  }
  return (
    <div className="port-mapping-list">
      {container.port_mappings.map((mapping) => (
        <Tag key={`${mapping.host_port}-${mapping.container_port}-${mapping.protocol}`} color="blue">
          {mapping.host_port}:{mapping.container_port}/{mapping.protocol}
        </Tag>
      ))}
    </div>
  );
}
