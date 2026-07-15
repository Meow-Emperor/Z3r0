import { Button, Table, Tag } from "@douyinfe/semi-ui";
import { Boxes, Download, Pencil, Server, SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createManagedHost, deleteManagedHost, listManagedHostImages, pullManagedHostImages, removeManagedHostImage, queryManagedHosts, updateManagedHost } from "../../shared/api/hosts";
import { querySandboxImages } from "../../shared/api/sandboxImages";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import { RESOURCE_PAGE_SIZE } from "../../shared/api/generated/constants";
import type { ManagedHost, ManagedHostImage, SandboxImage } from "../../shared/api/types";
import { AppModal } from "../../shared/components/AppModal";
import { AsyncContent } from "../../shared/components/AsyncContent";
import { PagedResourceTable } from "../../shared/components/PagedResourceTable";
import { OptionListSelect } from "../../shared/components/OptionListSelect";
import type { ResourceColumn } from "../../shared/components/ResourceTable";
import { DeleteRowAction, OwnerCell, ResourceIdentity, RowActionButton, RowActions, SecretCell } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { useOptionList } from "../../shared/hooks/useOptionList";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { useVisibleResourceIds } from "../../shared/hooks/useVisibleResourceIds";
import { formatDateTime } from "../../shared/lib/date";
import { formatBytes } from "../../shared/lib/number";
import { useContainerShell } from "../container-shell/ContainerShellProvider";
import { HostFormModal } from "./HostFormModal";

type ModalState = { mode: "create" } | { mode: "edit"; host: ManagedHost } | null;

export function HostsPage() {
  const hosts = usePagedResourceList<ManagedHost>({ query: queryManagedHosts });
  const [modal, setModal] = useState<ModalState>(null);
  const [imageModalHost, setImageModalHost] = useState<ManagedHost | null>(null);
  const secrets = useVisibleResourceIds(hosts.items);
  const { openHostShell } = useContainerShell();
  const { run: deleteHost, busyId: deletingHostId } = useResourceAction<ManagedHost>(
    (host) => deleteManagedHost(host.id),
    hosts.loadItems,
  );

  useAdminResourceHeader({
    createLabel: "Create Host",
    refreshLabel: "Refresh hosts",
    loading: hosts.loading,
    onCreate: () => setModal({ mode: "create" }),
    onRefresh: hosts.loadItems,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModal(null);
      await hosts.loadItems();
    },
  });

  const summary = useMemo(() => ({
    ssh: hosts.items.filter((host) => host.ssh_port > 0).length,
    docker: hosts.items.filter((host) => host.docker_management_port > 0).length,
  }), [hosts.items]);

  const columns: ResourceColumn<ManagedHost>[] = [
    {
      key: "host", header: "Host", width: "minmax(0, 0.7fr)",
      render: (host) => (
        <ResourceIdentity icon={<Server size={18} />} title={host.ip_address} detail={`SSH ${host.ssh_port}`} />
      ),
    },
    {
      key: "account", header: "Account", width: "minmax(0, 0.5fr)",
      render: (host) => <OwnerCell>{host.host_account}</OwnerCell>,
    },
    {
      key: "password", header: "Password", width: "minmax(0, 0.6fr)",
      render: (host) => (
        <SecretCell id={host.ip_address} value={host.host_password} visible={secrets.isVisible(host.id)} maskEmpty onToggle={() => secrets.toggle(host.id)} />
      ),
    },
    {
      key: "docker", header: "Docker Port", width: "110px",
      render: (host) => host.docker_management_port,
    },
    {
      key: "tls", header: "Mode", width: "90px",
      render: (host) => (
        <Tag color={host.docker_tls_enabled ? "green" : "grey"}>
          {host.docker_tls_enabled ? "TLS" : "Plain"}
        </Tag>
      ),
    },
    { key: "updated", header: "Updated", width: "minmax(0, 0.7fr)", render: (host) => formatDateTime(host.updated_at) },
    {
      key: "actions", header: "Actions", width: "140px",
      render: (host) => (
        <RowActions>
          <RowActionButton icon={<SquareTerminal size={15} />} label={`Connect shell for ${host.ip_address}`}
            onClick={() => openHostShell(host)}
          />
          <RowActionButton icon={<Boxes size={15} />} label={`Manage images for ${host.ip_address}`}
            onClick={() => setImageModalHost(host)}
          />
          <RowActionButton icon={<Pencil size={15} />} label={`Edit ${host.ip_address}`}
            onClick={() => setModal({ mode: "edit", host })}
          />
          <DeleteRowAction title="Delete host" content={`Delete ${host.ip_address}?`} label={`Delete ${host.ip_address}`}
            loading={deletingHostId === host.id} onConfirm={() => void deleteHost(host)}
          />
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PagedResourceTable
        ariaLabel="Managed hosts"
        columns={columns}
        rows={hosts.items}
        rowKey={(host) => host.id}
        searchPlaceholder="Search IP, account, SSH port, or Docker port"
        state={hosts}
        metrics={[
          { label: "Total", value: hosts.total },
          { label: "SSH", value: summary.ssh },
          { label: "Docker Ports", value: summary.docker },
        ]}
        emptyIcon={<Server size={42} />}
        emptyTitle="No hosts found"
      />

      <HostFormModal
        open={Boolean(modal)}
        host={modal?.mode === "edit" ? modal.host : null}
        saving={saving}
        onCancel={() => setModal(null)}
        onCreate={(payload) => submit(() => createManagedHost(payload))}
        onUpdate={(host, payload) => submit(() => updateManagedHost(host.id, payload))}
      />
      <HostImagesModal host={imageModalHost} onClose={() => setImageModalHost(null)} />
    </>
  );
}

function HostImagesModal({ host, onClose }: { host: ManagedHost | null; onClose: () => void }) {
  const [hostImages, setHostImages] = useState<ManagedHostImage[]>([]);
  const [selectedImageNames, setSelectedImageNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const actionIdRef = useRef(0);
  const activeActionRef = useRef<number | null>(null);
  const imageOptions = useOptionList<SandboxImage>({
    enabled: Boolean(host),
    query: querySandboxImages,
  });

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeActionRef.current = null;
    setSelectedImageNames([]);
    setHostImages([]);
    setPulling(false);
    setRemovingId(null);
    if (!host) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listManagedHostImages(host.id)
      .then((hostResponse) => {
        if (requestIdRef.current === requestId) {
          setHostImages(hostResponse.data?.items ?? []);
        }
      })
      .catch((error) => {
        if (requestIdRef.current === requestId) showApiError(error);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [host]);

  const pullSelected = async () => {
    if (!host || selectedImageNames.length === 0 || activeActionRef.current !== null) return;
    const actionId = actionIdRef.current + 1;
    actionIdRef.current = actionId;
    activeActionRef.current = actionId;
    const requestId = requestIdRef.current;
    setPulling(true);
    try {
      const response = await pullManagedHostImages(host.id, { image_names: selectedImageNames });
      if (requestIdRef.current !== requestId) return;
      showApiSuccess(response);
      const refreshed = await listManagedHostImages(host.id);
      if (requestIdRef.current !== requestId) return;
      setHostImages(refreshed.data?.items ?? []);
      setSelectedImageNames([]);
    } catch (error) {
      if (requestIdRef.current === requestId) showApiError(error);
    } finally {
      if (activeActionRef.current === actionId) activeActionRef.current = null;
      if (requestIdRef.current === requestId && activeActionRef.current === null) setPulling(false);
    }
  };

  const removeImage = async (image: ManagedHostImage) => {
    if (!host || activeActionRef.current !== null) return;
    const actionId = actionIdRef.current + 1;
    actionIdRef.current = actionId;
    activeActionRef.current = actionId;
    const requestId = requestIdRef.current;
    setRemovingId(image.image_id);
    try {
      await removeManagedHostImage(host.id, { image_id: image.image_id, force: false });
      if (requestIdRef.current === requestId) {
        setHostImages((current) => current.filter((i) => i.image_id !== image.image_id));
      }
    } catch (error) {
      if (requestIdRef.current === requestId) showApiError(error);
    } finally {
      if (activeActionRef.current === actionId) activeActionRef.current = null;
      if (requestIdRef.current === requestId && activeActionRef.current === null) setRemovingId(null);
    }
  };

  return (
    <AppModal
      title={host ? `Images on ${host.ip_address}` : "Host Images"}
      titleIcon={<Boxes size={17} />}
      open={Boolean(host)}
      width={680}
      onCancel={onClose}
      className="host-images-modal"
    >
      <div className="host-images-toolbar">
        <OptionListSelect
          source={imageOptions}
          multiple
          value={selectedImageNames}
          placeholder="Select images to pull"
          optionList={imageOptions.items.map((image) => ({ label: image.image_name, value: image.image_name }))}
          disabled={activeActionRef.current !== null}
          emptyContent="No images"
          onChange={(value) => setSelectedImageNames(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])}
        />
        <Button icon={<Download size={15} />} theme="solid" type="primary" loading={pulling} disabled={activeActionRef.current !== null || selectedImageNames.length === 0} onClick={() => void pullSelected()}>
          Pull
        </Button>
      </div>
      <AsyncContent
        loading={loading}
        empty={hostImages.length === 0}
        emptyIcon={<Boxes size={42} />}
        emptyTitle="No host images found"
      >
        <Table
          dataSource={hostImages}
          pagination={{ pageSize: RESOURCE_PAGE_SIZE }}
          size="small"
          rowKey={(record?: ManagedHostImage) => record?.image_id || record?.image_name || ""}
          columns={[
          { title: "Image", dataIndex: "image_name" },
          { title: "Hash", dataIndex: "image_hash", width: 120, render: (value) => String(value || "").slice(0, 12) || "-" },
          { title: "Size", dataIndex: "image_size", width: 100, render: (value) => formatBytes(Number(value || 0)) },
          {
            title: "", dataIndex: "image_id", width: 50,
            render: (_value, record) => (
              <DeleteRowAction title="Remove image" content={`Remove ${(record as ManagedHostImage).image_name || "this image"}?`}
                label="Remove image" size="small" loading={removingId === (record as ManagedHostImage).image_id}
                disabled={activeActionRef.current !== null} onConfirm={() => void removeImage(record as ManagedHostImage)}
              />
            ),
          },
          ]}
        />
      </AsyncContent>
    </AppModal>
  );
}
