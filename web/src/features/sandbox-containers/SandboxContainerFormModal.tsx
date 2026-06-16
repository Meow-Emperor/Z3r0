import { Select, Switch } from "@douyinfe/semi-ui";
import { Boxes, Network, Server, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CreateSandboxContainerRequest, EgressProxy, ManagedHost, SandboxImage, SystemUser } from "../../shared/api/types";
import { ResourceModal } from "../../shared/components/ResourceModal";
import {
  createEmptyPortMapping,
  PortMappingEditor,
  type PortMappingFormValue,
} from "./PortMappingEditor";

type SandboxContainerFormModalProps = {
  open: boolean;
  saving: boolean;
  images: SandboxImage[];
  imagesLoading: boolean;
  hosts: ManagedHost[];
  hostsLoading: boolean;
  users: SystemUser[];
  usersLoading: boolean;
  egressProxies: EgressProxy[];
  egressProxiesLoading: boolean;
  currentUserId: number;
  onCancel: () => void;
  onSubmit: (payload: CreateSandboxContainerRequest) => Promise<void>;
};

export function SandboxContainerFormModal({
  open,
  saving,
  images,
  imagesLoading,
  hosts,
  hostsLoading,
  users,
  usersLoading,
  egressProxies,
  egressProxiesLoading,
  currentUserId,
  onCancel,
  onSubmit,
}: SandboxContainerFormModalProps) {
  const availableImages = useMemo(() => images, [images]);
  const [hostId, setHostId] = useState<number | undefined>();
  const [imageId, setImageId] = useState<number | undefined>();
  const [egressProxyId, setEgressProxyId] = useState<number | undefined>();
  const [ownerId, setOwnerId] = useState<number | undefined>();
  const [portMappings, setPortMappings] = useState<PortMappingFormValue[]>([]);
  const [novncSupport, setNoVNCSupport] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHostId(undefined);
    setImageId(undefined);
    setEgressProxyId(undefined);
    setOwnerId(currentUserId);
    setPortMappings([]);
    setNoVNCSupport(false);
  }, [open, currentUserId]);

  const submit = () => onSubmit({
    host_id: hostId || 0,
    image_id: imageId || 0,
    egress_proxy_id: egressProxyId,
    owner_id: ownerId !== currentUserId ? ownerId : undefined,
    novnc_support: novncSupport,
    port_mappings: portMappings.map(({ container_port, host_port, protocol }) => ({
      container_port,
      host_port,
      protocol,
    })),
  });

  const updateMapping = (id: string, patch: Partial<PortMappingFormValue>) => {
    setPortMappings((current) => current.map((mapping) => (
      mapping.id === id ? { ...mapping, ...patch } : mapping
    )));
  };

  const removeMapping = (id: string) => {
    setPortMappings((current) => current.filter((item) => item.id !== id));
  };

  const addMapping = () => {
    setPortMappings((current) => [...current, createEmptyPortMapping()]);
  };

  const selectImage = (value: unknown) => {
    if (typeof value === "number") setImageId(value);
  };

  const submitDisabled = !hostId || !imageId;

  return (
    <ResourceModal
      open={open}
      title="Create Sandbox Container"
      saving={saving}
      submitLabel="Create"
      submitDisabled={submitDisabled}
      width={640}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <label>
        <span>Host</span>
        <Select
          prefix={<Server size={16} />}
          value={hostId}
          loading={hostsLoading}
          disabled={hosts.length === 0}
          placeholder="Select managed host"
          onChange={(value) => typeof value === "number" && setHostId(value)}
          optionList={hosts.map((host) => ({ label: `${host.ip_address}:${host.docker_management_port}`, value: host.id }))}
        />
      </label>

      <label>
        <span>Image</span>
        <Select
          prefix={<Boxes size={16} />}
          value={imageId}
          loading={imagesLoading}
          disabled={availableImages.length === 0}
          placeholder="Select a sandbox image"
          onChange={selectImage}
          optionList={availableImages.map((image) => ({ label: `${image.image_name} :${image.default_exposed_port}`, value: image.id }))}
        />
      </label>

      <label>
        <span>Owner</span>
        <Select
          prefix={<User size={16} />}
          value={ownerId}
          loading={usersLoading}
          placeholder="Select container owner"
          onChange={(value) => typeof value === "number" && setOwnerId(value)}
          optionList={users.map((u) => ({ label: u.username, value: u.id }))}
        />
      </label>

      <label>
        <span>Egress Proxy</span>
        <Select
          prefix={<Network size={16} />}
          value={egressProxyId}
          loading={egressProxiesLoading}
          placeholder="No egress proxy"
          emptyContent="No egress proxies"
          onClear={() => setEgressProxyId(undefined)}
          onChange={(value) => setEgressProxyId(typeof value === "number" ? value : undefined)}
          optionList={egressProxies.map((proxy) => ({ label: egressProxyOptionLabel(proxy), value: proxy.id }))}
          showClear
        />
      </label>

      <div className="novnc-toggle-row">
        <span>noVNC</span>
        <div className="novnc-controls">
          <Switch checked={novncSupport} onChange={setNoVNCSupport} aria-label="Enable noVNC" />
        </div>
      </div>

      <PortMappingEditor
        mappings={portMappings}
        onAdd={addMapping}
        onRemove={removeMapping}
        onChange={updateMapping}
      />
    </ResourceModal>
  );
}

function egressProxyOptionLabel(proxy: EgressProxy) {
  return `${proxy.proxy_type}://${proxy.proxy_host}:${proxy.proxy_port}`;
}
