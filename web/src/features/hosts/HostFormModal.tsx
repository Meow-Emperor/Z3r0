import { Input, InputNumber } from "@douyinfe/semi-ui";
import { KeyRound, Network, PlugZap, Server, User } from "lucide-react";
import { useEffect, useState } from "react";
import type { CreateManagedHostRequest, ManagedHost, UpdateManagedHostRequest } from "../../shared/api/types";
import { ResourceModal } from "../../shared/components/ResourceModal";

type HostFormValues = {
  ip_address: string;
  ssh_port: number;
  host_account: string;
  host_password: string;
  docker_management_port: number;
};

type HostFormModalProps =
  | {
      open: boolean;
      mode: "create";
      host: null;
      saving: boolean;
      onCancel: () => void;
      onSubmit: (payload: CreateManagedHostRequest) => Promise<void>;
    }
  | {
      open: boolean;
      mode: "edit";
      host: ManagedHost;
      saving: boolean;
      onCancel: () => void;
      onSubmit: (payload: UpdateManagedHostRequest) => Promise<void>;
    };

const EMPTY: HostFormValues = {
  ip_address: "",
  ssh_port: 22,
  host_account: "",
  host_password: "",
  docker_management_port: 2375,
};

function initial(host: ManagedHost | null): HostFormValues {
  if (!host) return EMPTY;
  return {
    ip_address: host.ip_address,
    ssh_port: host.ssh_port,
    host_account: host.host_account,
    host_password: host.host_password,
    docker_management_port: host.docker_management_port,
  };
}

export function HostFormModal({ open, mode, host, saving, onCancel, onSubmit }: HostFormModalProps) {
  const [values, setValues] = useState<HostFormValues>(() => initial(host));

  useEffect(() => {
    if (open) setValues(initial(host));
  }, [open, host]);

  const submit = async () => {
    const payload = {
      ip_address: values.ip_address.trim(),
      ssh_port: values.ssh_port,
      host_account: values.host_account.trim(),
      host_password: values.host_password,
      docker_management_port: values.docker_management_port,
    };
    await onSubmit(payload);
  };

  const submitDisabled = (
    !values.ip_address.trim()
    || !values.host_account.trim()
    || !values.host_password
    || values.ssh_port < 1
    || values.ssh_port > 65535
    || values.docker_management_port < 1
    || values.docker_management_port > 65535
  );

  return (
    <ResourceModal
      open={open}
      title={mode === "create" ? "Create Host" : "Edit Host"}
      saving={saving}
      submitLabel={mode === "create" ? "Create" : "Save"}
      submitDisabled={submitDisabled}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <label>
        <span>IP Address</span>
        <Input prefix={<Server size={16} />} value={values.ip_address} maxLength={255} required
          onChange={(ip_address) => setValues((v) => ({ ...v, ip_address }))}
        />
      </label>
      <label>
        <span>SSH Port</span>
        <InputNumber prefix={<Network size={16} />} value={values.ssh_port} min={1} max={65535}
          onChange={(ssh_port) => typeof ssh_port === "number" && setValues((v) => ({ ...v, ssh_port }))}
        />
      </label>
      <label>
        <span>Host Account</span>
        <Input prefix={<User size={16} />} value={values.host_account} maxLength={128} required
          onChange={(host_account) => setValues((v) => ({ ...v, host_account }))}
        />
      </label>
      <label>
        <span>Host Password</span>
        <Input mode="password" prefix={<KeyRound size={16} />} value={values.host_password} maxLength={512} required
          onChange={(host_password) => setValues((v) => ({ ...v, host_password }))}
        />
      </label>
      <label>
        <span>Docker Management Port</span>
        <InputNumber prefix={<PlugZap size={16} />} value={values.docker_management_port} min={1} max={65535}
          onChange={(docker_management_port) => typeof docker_management_port === "number" && setValues((v) => ({ ...v, docker_management_port }))}
        />
      </label>
    </ResourceModal>
  );
}
