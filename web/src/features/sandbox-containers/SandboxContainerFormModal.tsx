import { Select } from "@douyinfe/semi-ui";
import { Boxes, Network, Route, Server, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { queryEgressProxies } from "../../shared/api/egressProxies";
import { SANDBOX_CONTAINER_EGRESS_MODE, SYSTEM_USER_ROLE } from "../../shared/api/generated/constants";
import {
  createSandboxContainer,
  querySandboxContainerHostOptions,
  querySandboxContainerImageOptions,
} from "../../shared/api/sandboxContainers";
import { querySystemUsers } from "../../shared/api/systemUsers";
import type {
  CreateSandboxContainerResponse,
  EgressProxy,
  SandboxContainer,
  SandboxContainerEgressMode,
  SandboxContainerHostOption,
  SandboxImage,
  SystemUser,
} from "../../shared/api/types";
import { useAuth } from "../../shared/auth/AuthProvider";
import { FormField } from "../../shared/components/FormField";
import { OptionListSelect } from "../../shared/components/OptionListSelect";
import { ResourceModal } from "../../shared/components/ResourceModal";
import { useOptionList } from "../../shared/hooks/useOptionList";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
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
  onCancel: () => void;
  onCreated: (container: SandboxContainer) => unknown | Promise<unknown>;
};

export function SandboxContainerFormModal({
  open,
  onCancel,
  onCreated,
}: SandboxContainerFormModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === SYSTEM_USER_ROLE.ADMIN;
  const currentUserId = user?.id ?? 0;
  const hostOptions = useOptionList<SandboxContainerHostOption>({
    enabled: open,
    query: querySandboxContainerHostOptions,
  });
  const imageOptions = useOptionList<SandboxImage>({
    enabled: open,
    query: querySandboxContainerImageOptions,
  });
  const userOptions = useOptionList<SystemUser>({ enabled: open && isAdmin, query: querySystemUsers });
  const egressProxyOptions = useOptionList<EgressProxy>({ enabled: open && isAdmin, query: queryEgressProxies });
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
  const { saving, submit: submitResource } = useResourceSubmit<CreateSandboxContainerResponse>({
    onSuccess: (response) => response.data ? onCreated(response.data) : undefined,
  });

  useEffect(() => {
    if (!open) return;
    setHostId(undefined);
    setImageId(undefined);
    setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
    setEgressProxyId(undefined);
    setOwnerId(currentUserId);
    setPortMappings([]);
  }, [open, currentUserId]);

  const submit = () => {
    if (!hostId || !imageId) return;
    void submitResource(() => createSandboxContainer({
      host_id: hostId,
      image_id: imageId,
      egress_mode: egressMode,
      egress_proxy_id: egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? egressProxyId : undefined,
      owner_id: isAdmin && ownerId !== currentUserId ? ownerId : undefined,
      port_mappings: portMappings.map(({ container_port, host_port, protocol }) => ({
        container_port,
        host_port,
        protocol,
      })),
    }));
  };

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
      <FormField label="Host">
        <OptionListSelect
          source={hostOptions}
          prefix={<Server size={16} />}
          value={hostId}
          disabled={hosts.length === 0}
          placeholder="Select managed host"
          emptyContent="No hosts"
          onChange={(value) => typeof value === "number" && setHostId(value)}
          optionList={hosts.map(sandboxHostOption)}
        />
      </FormField>

      <FormField label="Image">
        <OptionListSelect
          source={imageOptions}
          prefix={<Boxes size={16} />}
          value={imageId}
          disabled={images.length === 0}
          placeholder="Select a sandbox image"
          emptyContent="No images"
          onChange={selectImage}
          optionList={images.map(sandboxImageOption)}
        />
      </FormField>

      {isAdmin ? <FormField label="Owner">
        <OptionListSelect
          source={userOptions}
          prefix={<User size={16} />}
          value={ownerId}
          placeholder="Select container owner"
          emptyContent="No users"
          onChange={(value) => typeof value === "number" && setOwnerId(value)}
          optionList={users.map((u) => ({ label: u.username, value: u.id }))}
        />
      </FormField> : null}

      <FormField label="Egress Mode">
        <Select
          prefix={<Route size={16} />}
          value={egressMode}
          optionList={sandboxEgressModeOptions({ includeProxy: isAdmin, supportsTor: Boolean(selectedImage?.supports_tor) })}
          onChange={(value) => {
            if (typeof value !== "string") return;
            const next = value as SandboxContainerEgressMode;
            setEgressMode(next);
            if (next !== SANDBOX_CONTAINER_EGRESS_MODE.PROXY) setEgressProxyId(undefined);
          }}
        />
      </FormField>

      {egressMode === SANDBOX_CONTAINER_EGRESS_MODE.PROXY ? (
        <FormField label="Managed Proxy">
          <OptionListSelect
            source={egressProxyOptions}
            prefix={<Network size={16} />}
            value={egressProxyId}
            placeholder="Select an egress proxy"
            emptyContent="No egress proxies"
            onChange={(value) => setEgressProxyId(typeof value === "number" ? value : undefined)}
            optionList={egressProxies.map(egressProxyOption)}
          />
        </FormField>
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
