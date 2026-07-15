import { Input, InputNumber, Select } from "@douyinfe/semi-ui";
import { KeyRound, Network, Server, User } from "lucide-react";
import { useEffect, useState } from "react";
import { EGRESS_PROXY_TYPE, EGRESS_PROXY_TYPE_VALUES } from "../../shared/api/generated/constants";
import type { CreateEgressProxyRequest, EgressProxy, UpdateEgressProxyRequest } from "../../shared/api/types";
import { FormField } from "../../shared/components/FormField";
import { ResourceModal } from "../../shared/components/ResourceModal";

type EgressProxyFormValues = CreateEgressProxyRequest;

type EgressProxyFormModalProps = {
  open: boolean;
  proxy: EgressProxy | null;
  saving: boolean;
  onCancel: () => void;
  onCreate: (payload: CreateEgressProxyRequest) => Promise<void>;
  onUpdate: (proxy: EgressProxy, payload: UpdateEgressProxyRequest) => Promise<void>;
};

const EMPTY: EgressProxyFormValues = {
  proxy_type: EGRESS_PROXY_TYPE.HTTP,
  proxy_host: "",
  proxy_port: 8080,
  proxy_account: "",
  proxy_password: "",
};

function initial(proxy: EgressProxy | null): EgressProxyFormValues {
  if (!proxy) return EMPTY;
  return {
    proxy_type: proxy.proxy_type,
    proxy_host: proxy.proxy_host,
    proxy_port: proxy.proxy_port,
    proxy_account: proxy.proxy_account,
    proxy_password: proxy.proxy_password,
  };
}

export function EgressProxyFormModal({ open, proxy, saving, onCancel, onCreate, onUpdate }: EgressProxyFormModalProps) {
  const [values, setValues] = useState<EgressProxyFormValues>(() => initial(proxy));
  const editing = Boolean(proxy);

  useEffect(() => {
    if (open) setValues(initial(proxy));
  }, [open, proxy]);

  const submit = async () => {
    const payload = {
      proxy_type: values.proxy_type,
      proxy_host: values.proxy_host.trim(),
      proxy_port: values.proxy_port,
      proxy_account: values.proxy_account.trim(),
      proxy_password: values.proxy_password,
    };
    if (proxy) await onUpdate(proxy, payload);
    else await onCreate(payload);
  };

  const submitDisabled = (
    !values.proxy_host.trim()
    || values.proxy_port < 1
    || values.proxy_port > 65535
  );

  return (
    <ResourceModal
      open={open}
      title={editing ? "Edit Egress Proxy" : "Create Egress Proxy"}
      titleIcon={<Network size={17} />}
      saving={saving}
      submitLabel={editing ? "Save" : "Create"}
      submitDisabled={submitDisabled}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <FormField label="Proxy Type">
        <Select
          prefix={<Network size={16} />}
          value={values.proxy_type}
          optionList={EGRESS_PROXY_TYPE_VALUES.map((type) => ({ label: type.toUpperCase(), value: type }))}
          onChange={(proxy_type) => {
            if (typeof proxy_type === "string") setValues((current) => ({ ...current, proxy_type }));
          }}
        />
      </FormField>
      <FormField label="Proxy Host">
        <Input prefix={<Server size={16} />} value={values.proxy_host} maxLength={255} required
          autoComplete="off"
          onChange={(proxy_host) => setValues((current) => ({ ...current, proxy_host }))}
        />
      </FormField>
      <FormField label="Proxy Port">
        <InputNumber prefix={<Network size={16} />} value={values.proxy_port} min={1} max={65535}
          onChange={(proxy_port) => typeof proxy_port === "number" && setValues((current) => ({ ...current, proxy_port }))}
        />
      </FormField>
      <FormField label="Proxy Account">
        <Input prefix={<User size={16} />} value={values.proxy_account} maxLength={255}
          autoComplete="off"
          onChange={(proxy_account) => setValues((current) => ({ ...current, proxy_account }))}
        />
      </FormField>
      <FormField label="Proxy Password">
        <Input mode="password" prefix={<KeyRound size={16} />} value={values.proxy_password} maxLength={512}
          autoComplete="new-password"
          onChange={(proxy_password) => setValues((current) => ({ ...current, proxy_password }))}
        />
      </FormField>
    </ResourceModal>
  );
}
