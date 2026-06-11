import { InputNumber, Select, Switch, TextArea } from "@douyinfe/semi-ui";
import { Boxes, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CreateSandboxContainerRequest, SandboxImage, SystemUser } from "../../shared/api/types";
import { SANDBOX_CONTAINER_DEFAULT_COMMAND } from "../../shared/api/generated/constants";
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
  users: SystemUser[];
  usersLoading: boolean;
  currentUserId: number;
  onCancel: () => void;
  onSubmit: (payload: CreateSandboxContainerRequest) => Promise<void>;
};

const DEFAULT_NOVNC_PORT = 8000;

export function SandboxContainerFormModal({
  open,
  saving,
  images,
  imagesLoading,
  users,
  usersLoading,
  currentUserId,
  onCancel,
  onSubmit,
}: SandboxContainerFormModalProps) {
  const readyImages = useMemo(() => images.filter((image) => image.status === "ready"), [images]);
  const [imageId, setImageId] = useState<number | undefined>();
  const [ownerId, setOwnerId] = useState<number | undefined>();
  const [containerCommand, setContainerCommand] = useState(SANDBOX_CONTAINER_DEFAULT_COMMAND);
  const [portMappings, setPortMappings] = useState<PortMappingFormValue[]>([]);
  const [novncSupport, setNoVNCSupport] = useState(false);
  const [novncPort, setNoVNCPort] = useState(DEFAULT_NOVNC_PORT);

  useEffect(() => {
    if (!open) return;
    setImageId(readyImages[0]?.id);
    setOwnerId(currentUserId);
    setContainerCommand(SANDBOX_CONTAINER_DEFAULT_COMMAND);
    setPortMappings([]);
    setNoVNCSupport(false);
    setNoVNCPort(DEFAULT_NOVNC_PORT);
  }, [open, readyImages, currentUserId]);

  const submit = () => onSubmit({
    image_id: imageId || 0,
    owner_id: ownerId !== currentUserId ? ownerId : undefined,
    container_command: containerCommand.trim(),
    novnc_support: novncSupport,
    novnc_port: novncSupport ? novncPort : 0,
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

  const novncPortValid = !novncSupport || (novncPort >= 1 && novncPort <= 65535);
  const submitDisabled = !imageId || !novncPortValid;

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
        <span>Image</span>
        <Select
          prefix={<Boxes size={16} />}
          value={imageId}
          loading={imagesLoading}
          disabled={readyImages.length === 0}
          placeholder="Select a ready sandbox image"
          onChange={selectImage}
          optionList={readyImages.map((image) => ({ label: image.image_name, value: image.id }))}
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
        <span>Command</span>
        <TextArea
          value={containerCommand}
          maxLength={2000}
          autosize={{ minRows: 3, maxRows: 6 }}
          onChange={setContainerCommand}
        />
      </label>

      <div className="novnc-toggle-row">
        <span>noVNC</span>
        <div className="novnc-controls">
          <Switch checked={novncSupport} onChange={setNoVNCSupport} aria-label="Enable noVNC" />
          {novncSupport ? (
            <label className="novnc-port-field">
              <span>Container Port</span>
              <InputNumber
                value={novncPort}
                min={1}
                max={65535}
                onChange={(value) => typeof value === "number" && setNoVNCPort(value)}
              />
            </label>
          ) : null}
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
