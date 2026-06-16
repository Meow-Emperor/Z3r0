import { Input, InputNumber } from "@douyinfe/semi-ui";
import { Network, Package } from "lucide-react";
import { useEffect, useState } from "react";
import type { CreateSandboxImageRequest } from "../../shared/api/types";
import { ResourceModal } from "../../shared/components/ResourceModal";

type SandboxImageFormModalProps = {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateSandboxImageRequest) => Promise<void>;
};

const EMPTY: CreateSandboxImageRequest = { image_name: "security-sandbox:latest", default_exposed_port: 8000 };

export function SandboxImageFormModal({ open, saving, onCancel, onSubmit }: SandboxImageFormModalProps) {
  const [values, setValues] = useState<CreateSandboxImageRequest>(EMPTY);

  useEffect(() => {
    if (open) setValues(EMPTY);
  }, [open]);

  return (
    <ResourceModal
      open={open}
      title="Create Sandbox Image"
      saving={saving}
      submitLabel="Create"
      submitDisabled={!values.image_name.trim() || values.default_exposed_port < 1 || values.default_exposed_port > 65535}
      onCancel={onCancel}
      onSubmit={() => onSubmit({ image_name: values.image_name.trim(), default_exposed_port: values.default_exposed_port })}
    >
      <label>
        <span>Image Name</span>
        <Input prefix={<Package size={16} />} value={values.image_name}
          placeholder="ghcr.io/org/image:latest" maxLength={255} required
          onChange={(image_name) => setValues((current) => ({ ...current, image_name }))}
        />
      </label>
      <label>
        <span>Default Exposed Port</span>
        <InputNumber
          prefix={<Network size={16} />}
          value={values.default_exposed_port}
          min={1}
          max={65535}
          onChange={(default_exposed_port) => {
            if (typeof default_exposed_port === "number") setValues((current) => ({ ...current, default_exposed_port }));
          }}
        />
      </label>
    </ResourceModal>
  );
}
