import { Select, Spin } from "@douyinfe/semi-ui";
import { Boxes, Route, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createSandboxContainer, getSandboxContainerCreateOptions } from "../../shared/api/sandboxContainers";
import { SANDBOX_CONTAINER_EGRESS_MODE } from "../../shared/api/generated/constants";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import type {
  SandboxContainer,
  SandboxContainerEgressMode,
  SandboxContainerHostOption,
  SandboxImage,
} from "../../shared/api/types";
import { ResourceModal } from "../../shared/components/ResourceModal";

type PlaygroundSandboxCreateModalProps = {
  open: boolean;
  onCancel: () => void;
  onCreated: (container: SandboxContainer) => void;
};

export function PlaygroundSandboxCreateModal({ open, onCancel, onCreated }: PlaygroundSandboxCreateModalProps) {
  const [hosts, setHosts] = useState<SandboxContainerHostOption[]>([]);
  const [images, setImages] = useState<SandboxImage[]>([]);
  const [hostId, setHostId] = useState<number | undefined>();
  const [imageId, setImageId] = useState<number | undefined>();
  const [egressMode, setEgressMode] = useState<SandboxContainerEgressMode>(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedImage = useMemo(() => images.find((image) => image.id === imageId) ?? null, [imageId, images]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setHostId(undefined);
    setImageId(undefined);
    setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
    setLoading(true);
    getSandboxContainerCreateOptions()
      .then((response) => {
        if (!active) return;
        const options = response.data;
        setHosts(options?.hosts ?? []);
        setImages(options?.images ?? []);
      })
      .catch((error) => {
        if (active) showApiError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const submit = async () => {
    if (!hostId || !imageId) return;
    setSaving(true);
    try {
      const response = await createSandboxContainer({
        host_id: hostId,
        image_id: imageId,
        egress_mode: egressMode,
        port_mappings: [],
      });
      if (response.data) {
        showApiSuccess(response);
        onCreated(response.data);
      }
    } catch (error) {
      showApiError(error);
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled = (
    loading
    || !hostId
    || !imageId
    || (egressMode === SANDBOX_CONTAINER_EGRESS_MODE.TOR && !selectedImage?.supports_tor)
  );

  return (
    <ResourceModal
      open={open}
      title="Create Sandbox Container"
      saving={saving}
      submitLabel="Create"
      submitDisabled={submitDisabled}
      width={520}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <label>
        <span>Host</span>
        <Select
          prefix={<Server size={16} />}
          value={hostId}
          loading={loading}
          disabled={loading || hosts.length === 0}
          placeholder={loading ? "Loading hosts" : "Select managed host"}
          emptyContent={loading ? <Spin size="small" /> : "No hosts"}
          optionList={hosts.map((host) => ({
            label: `${host.ip_address}:${host.docker_management_port}`,
            value: host.id,
          }))}
          onChange={(value) => typeof value === "number" && setHostId(value)}
        />
      </label>

      <label>
        <span>Image</span>
        <Select
          prefix={<Boxes size={16} />}
          value={imageId}
          loading={loading}
          disabled={loading || images.length === 0}
          placeholder={loading ? "Loading images" : "Select sandbox image"}
          emptyContent={loading ? <Spin size="small" /> : "No images"}
          optionList={images.map((image) => ({
            label: `${image.image_name} · control ${image.control_proxy_port}`,
            value: image.id,
          }))}
          onChange={(value) => {
            if (typeof value !== "number") return;
            const nextImage = images.find((image) => image.id === value) ?? null;
            setImageId(value);
            if (!nextImage?.supports_tor && egressMode === SANDBOX_CONTAINER_EGRESS_MODE.TOR) {
              setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
            }
          }}
        />
      </label>

      <label>
        <span>Egress Mode</span>
        <Select
          prefix={<Route size={16} />}
          value={egressMode}
          optionList={[
            { label: "Direct", value: SANDBOX_CONTAINER_EGRESS_MODE.DIRECT },
            { label: "Tor", value: SANDBOX_CONTAINER_EGRESS_MODE.TOR, disabled: !selectedImage?.supports_tor },
          ]}
          onChange={(value) => {
            if (typeof value === "string") setEgressMode(value as SandboxContainerEgressMode);
          }}
        />
      </label>
    </ResourceModal>
  );
}
