import { Select, Spin } from "@douyinfe/semi-ui";
import { Boxes, Network, Route, Server, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SANDBOX_CONTAINER_EGRESS_MODE } from "../../shared/api/generated/constants";
import type { CreateSandboxContainerRequest, EgressProxy, ManagedHost, SandboxContainerEgressMode, SandboxImage, SystemUser } from "../../shared/api/types";
import { ResourceModal } from "../../shared/components/ResourceModal";
import type { OptionListResult } from "../../shared/hooks/useOptionList";
import {
  egressProxyOption,
  sandboxEgressModeOptions,
  sandboxHostOption,
  sandboxImageOption,
} from "../../shared/lib/sandboxOptions";
import {
  createEmptyPortMapping,
  PortMappingEditor,
  type PortMappingFormValue,
} from "./PortMappingEditor";

type SandboxContainerFormModalProps = {
  open: boolean;
  saving: boolean;
  imageOptions: OptionListResult<SandboxImage>;
  hostOptions: OptionListResult<ManagedHost>;
  userOptions: OptionListResult<SystemUser>;
  egressProxyOptions: OptionListResult<EgressProxy>;
  currentUserId: number;
  onCancel: () => void;
  onSubmit: (payload: CreateSandboxContainerRequest) => Promise<void>;
};

export function SandboxContainerFormModal({
  open,
  saving,
  imageOptions,
  hostOptions,
  userOptions,
  egressProxyOptions,
  currentUserId,
  onCancel,
  onSubmit,
}: SandboxContainerFormModalProps) {
  const images = imageOptions.items;
  const hosts = hostOptions.items;
  const users = userOptions.items;
  const egressProxies = egressProxyOptions.items;
  const [hostId, setHostId] = useState<number | undefined>();
  const [imageId, setImageId] = useState<number | undefined>();
  const [egressMode, setEgressMode] = useState<SandboxContainerEgressMode>(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
  const [egressProxyId, setEgressProxyId] = useState<number | undefined>();
  const [ownerId, setOwnerId] = useState<number | undefined>();
  const [portMappings, setPortMappings] = useState<PortMappingFormValue[]>([]);
  const selectedImage = useMemo(
    () => imageOptions.knownItems.find((image) => image.id === imageId),
    [imageId, imageOptions.knownItems],
  );

  useEffect(() => {
    if (!open) return;
    setHostId(undefined);
    setImageId(undefined);
    setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
    setEgressProxyId(undefined);
    setOwnerId(currentUserId);
    setPortMappings([]);
  }, [open, currentUserId]);

  const submit = () => onSubmit({
    host_id: hostId || 0,
    image_id: imageId || 0,
    egress_mode: egressMode,
    egress_proxy_id: egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? egressProxyId : undefined,
    owner_id: ownerId !== currentUserId ? ownerId : undefined,
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
    if (typeof value !== "number") return;
    const nextImage = imageOptions.knownItems.find((image) => image.id === value);
    setImageId(value);
    if (!nextImage?.supports_tor && egressMode === SANDBOX_CONTAINER_EGRESS_MODE.TOR) {
      setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
    }
  };

  const submitDisabled = (
    !hostId
    || !imageId
    || (egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY && !egressProxyId)
    || (egressMode === SANDBOX_CONTAINER_EGRESS_MODE.TOR && !selectedImage?.supports_tor)
  );

  return (
    <ResourceModal
      open={open}
      title="Create Sandbox Container"
      titleIcon={<Boxes size={17} />}
      saving={saving}
      submitLabel="Create"
      submitDisabled={submitDisabled}
      size="standard"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <label>
        <span>Host</span>
        <Select
          prefix={<Server size={16} />}
          value={hostId}
          loading={hostOptions.busy}
          disabled={hosts.length === 0}
          placeholder="Select managed host"
          remote
          onSearch={hostOptions.search}
          onListScroll={hostOptions.onListScroll}
          onChange={(value) => typeof value === "number" && setHostId(value)}
          optionList={hosts.map(sandboxHostOption)}
        />
      </label>

      <label>
        <span>Image</span>
        <Select
          prefix={<Boxes size={16} />}
          value={imageId}
          loading={imageOptions.busy}
          disabled={images.length === 0}
          placeholder="Select a sandbox image"
          remote
          onSearch={imageOptions.search}
          onListScroll={imageOptions.onListScroll}
          onChange={selectImage}
          optionList={images.map(sandboxImageOption)}
        />
      </label>

      <label>
        <span>Owner</span>
        <Select
          prefix={<User size={16} />}
          value={ownerId}
          loading={userOptions.busy}
          placeholder="Select container owner"
          remote
          onSearch={userOptions.search}
          onListScroll={userOptions.onListScroll}
          onChange={(value) => typeof value === "number" && setOwnerId(value)}
          optionList={users.map((u) => ({ label: u.username, value: u.id }))}
        />
      </label>

      <label>
        <span>Egress Mode</span>
        <Select
          prefix={<Route size={16} />}
          value={egressMode}
          optionList={sandboxEgressModeOptions({ includeProxy: true, supportsTor: Boolean(selectedImage?.supports_tor) })}
          onChange={(value) => {
            if (typeof value !== "string") return;
            const next = value as SandboxContainerEgressMode;
            setEgressMode(next);
            if (next !== SANDBOX_CONTAINER_EGRESS_MODE.PROXY) setEgressProxyId(undefined);
          }}
        />
      </label>

      {egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? (
        <label>
          <span>Managed Proxy</span>
          <Select
            prefix={<Network size={16} />}
            value={egressProxyId}
            loading={egressProxyOptions.busy}
            placeholder="Select an egress proxy"
            emptyContent={egressProxyOptions.busy ? <Spin size="small" /> : "No egress proxies"}
            remote
            onSearch={egressProxyOptions.search}
            onListScroll={egressProxyOptions.onListScroll}
            onChange={(value) => setEgressProxyId(typeof value === "number" ? value : undefined)}
            optionList={egressProxies.map(egressProxyOption)}
          />
        </label>
      ) : null}

      <PortMappingEditor
        mappings={portMappings}
        onAdd={addMapping}
        onRemove={removeMapping}
        onChange={updateMapping}
      />
    </ResourceModal>
  );
}
