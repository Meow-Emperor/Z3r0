import { Select, Spin } from "@douyinfe/semi-ui";
import { Boxes, Route, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createSandboxContainer,
  querySandboxContainerHostOptions,
  querySandboxContainerImageOptions,
} from "../../shared/api/sandboxContainers";
import { SANDBOX_CONTAINER_EGRESS_MODE } from "../../shared/api/generated/constants";
import type {
  CreateSandboxContainerResponse,
  SandboxContainer,
  SandboxContainerEgressMode,
  SandboxContainerHostOption,
  SandboxImage,
} from "../../shared/api/types";
import { FormField } from "../../shared/components/FormField";
import { ResourceModal } from "../../shared/components/ResourceModal";
import { useOptionList } from "../../shared/hooks/useOptionList";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import {
  sandboxEgressModeOptions,
  sandboxHostOption,
  sandboxImageOption,
} from "../../shared/lib/sandboxOptions";

type PlaygroundSandboxCreateModalProps = {
  open: boolean;
  onCancel: () => void;
  onCreated: (container: SandboxContainer) => void;
};

export function PlaygroundSandboxCreateModal({ open, onCancel, onCreated }: PlaygroundSandboxCreateModalProps) {
  const [hostId, setHostId] = useState<number | undefined>();
  const [imageId, setImageId] = useState<number | undefined>();
  const [egressMode, setEgressMode] = useState<SandboxContainerEgressMode>(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
  const hostOptions = useOptionList<SandboxContainerHostOption>({
    enabled: open,
    query: querySandboxContainerHostOptions,
  });
  const imageOptions = useOptionList<SandboxImage>({
    enabled: open,
    query: querySandboxContainerImageOptions,
  });
  const hosts = hostOptions.items;
  const images = imageOptions.items;
  const selectedImage = useMemo(
    () => imageOptions.knownItems.find((image) => image.id === imageId) ?? null,
    [imageId, imageOptions.knownItems],
  );
  const { saving, submit: submitResource } = useResourceSubmit<CreateSandboxContainerResponse>({
    onSuccess: (response) => {
      if (response.data) onCreated(response.data);
    },
  });

  useEffect(() => {
    if (!open) return;
    setHostId(undefined);
    setImageId(undefined);
    setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
  }, [open]);

  const submit = () => {
    if (!hostId || !imageId) return;
    void submitResource(() => createSandboxContainer({
        host_id: hostId,
        image_id: imageId,
        egress_mode: egressMode,
        port_mappings: [],
      }));
  };

  const submitDisabled = (
    (hostOptions.loading && hosts.length === 0)
    || (imageOptions.loading && images.length === 0)
    || !hostId
    || !imageId
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
      onCancel={onCancel}
      onSubmit={submit}
    >
      <FormField label="Host">
        <Select
          prefix={<Server size={16} />}
          value={hostId}
          loading={hostOptions.busy}
          disabled={hosts.length === 0}
          placeholder={hostOptions.loading ? "Loading hosts" : "Select managed host"}
          emptyContent={hostOptions.busy ? <Spin size="small" /> : "No hosts"}
          optionList={hosts.map(sandboxHostOption)}
          remote
          onSearch={hostOptions.search}
          onListScroll={hostOptions.onListScroll}
          onChange={(value) => typeof value === "number" && setHostId(value)}
        />
      </FormField>

      <FormField label="Image">
        <Select
          prefix={<Boxes size={16} />}
          value={imageId}
          loading={imageOptions.busy}
          disabled={images.length === 0}
          placeholder={imageOptions.loading ? "Loading images" : "Select sandbox image"}
          emptyContent={imageOptions.busy ? <Spin size="small" /> : "No images"}
          optionList={images.map(sandboxImageOption)}
          remote
          onSearch={imageOptions.search}
          onListScroll={imageOptions.onListScroll}
          onChange={(value) => {
            if (typeof value !== "number") return;
            const nextImage = imageOptions.knownItems.find((image) => image.id === value) ?? null;
            setImageId(value);
            if (!nextImage?.supports_tor && egressMode === SANDBOX_CONTAINER_EGRESS_MODE.TOR) {
              setEgressMode(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT);
            }
          }}
        />
      </FormField>

      <FormField label="Egress Mode">
        <Select
          prefix={<Route size={16} />}
          value={egressMode}
          optionList={sandboxEgressModeOptions({ includeProxy: false, supportsTor: Boolean(selectedImage?.supports_tor) })}
          onChange={(value) => {
            if (typeof value === "string") setEgressMode(value as SandboxContainerEgressMode);
          }}
        />
      </FormField>
    </ResourceModal>
  );
}
