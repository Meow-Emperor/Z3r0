import { Button, Input, InputNumber, Spin, Switch, TextArea } from "@douyinfe/semi-ui";
import { Bot, DatabaseZap, RotateCcw, Save, Settings, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getInstanceConfig, updateInstanceConfig } from "../../shared/api/systemConfig";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import { MetricStrip } from "../../shared/components/ResourcePageShell";
import { cx } from "../../shared/lib/className";
import type {
  AgentConfig,
  AgentPoolConfig,
  AgentRuntimeConfig,
  InstanceConfig,
  LightRAGConfig,
  UpdateInstanceConfigRequest,
} from "../../shared/api/types";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";

type AgentFormValue = AgentConfig;
type LightRAGFormValue = LightRAGConfig;

type ConfigFormValue = {
  agents: AgentFormValue[];
  agent_pool: AgentPoolConfig;
  agent_runtime: AgentRuntimeConfig;
  lightrag: LightRAGFormValue;
};

type FieldKey<T, Value> = {
  [Key in keyof T]: T[Key] extends Value ? Key : never;
}[keyof T];

type ConfigField<T> =
  | { kind: "number"; key: FieldKey<T, number>; label: string; min?: number; max?: number; step?: number }
  | { kind: "toggle"; key: FieldKey<T, boolean>; label: string };

type AgentTextField = {
  key: keyof Pick<AgentConfig, "name" | "base_url" | "model" | "api_key">;
  label: string;
  maxLength?: number;
  password?: boolean;
};

const RUNTIME_FIELDS: ConfigField<AgentRuntimeConfig>[] = [
  { kind: "number", key: "main_max_turns", label: "Main Max Turns", min: 1 },
  { kind: "number", key: "subordinate_max_turns", label: "Subordinate Max Turns", min: 1 },
  { kind: "number", key: "model_stream_idle_timeout_seconds", label: "Stream Idle Timeout", min: 30 },
  { kind: "number", key: "report_retention_seconds", label: "Report Retention Seconds", min: 0 },
  { kind: "number", key: "context_compression_trigger_ratio", label: "Trigger Ratio", min: 0.01, max: 0.99, step: 0.01 },
  { kind: "number", key: "context_compression_hard_stop_ratio", label: "Hard Stop Ratio", min: 0.01, max: 0.99, step: 0.01 },
  { kind: "number", key: "context_compression_target_ratio", label: "Target Ratio", min: 0.01, max: 0.99, step: 0.01 },
  { kind: "number", key: "context_budget_model_call_ratio", label: "Model Call Budget", min: 0.01, max: 0.99, step: 0.01 },
  { kind: "number", key: "context_compression_preserve_recent_ratio", label: "Preserve Recent Ratio", min: 0.01, max: 0.99, step: 0.01 },
  { kind: "number", key: "context_compression_preserve_recent_items", label: "Preserve Recent Items", min: 1 },
  { kind: "number", key: "context_compression_min_items", label: "Minimum Items", min: 1 },
  { kind: "number", key: "context_compression_summary_max_tokens", label: "Summary Max Tokens", min: 512 },
  { kind: "toggle", key: "context_compression_enabled", label: "Context Compression" },
];

const POOL_FIELDS: ConfigField<AgentPoolConfig>[] = [
  { kind: "number", key: "max_size", label: "Max Size", min: 1 },
  { kind: "number", key: "ttl_seconds", label: "TTL Seconds", min: 0 },
  { kind: "number", key: "sweep_interval_seconds", label: "Sweep Interval Seconds", min: 1 },
];

const AGENT_TEXT_FIELDS: AgentTextField[] = [
  { key: "name", label: "Name", maxLength: 128 },
  { key: "base_url", label: "Base URL" },
  { key: "model", label: "Model" },
  { key: "api_key", label: "API Key", password: true },
];

function toFormValue(config: InstanceConfig): ConfigFormValue {
  if (!config.agent_pool || !config.agent_runtime || !config.lightrag) {
    throw new Error("instance config is incomplete");
  }
  const agents = Object.values(config.agents ?? {}).map((agent) => ({ ...agent }));
  return {
    agents,
    agent_pool: { ...config.agent_pool },
    agent_runtime: { ...config.agent_runtime },
    lightrag: { ...config.lightrag },
  };
}

function cloneFormValue(values: ConfigFormValue): ConfigFormValue {
  return {
    agents: values.agents.map((agent) => ({ ...agent })),
    agent_pool: { ...values.agent_pool },
    agent_runtime: { ...values.agent_runtime },
    lightrag: { ...values.lightrag },
  };
}

function toPayload(values: ConfigFormValue): UpdateInstanceConfigRequest {
  const agents: NonNullable<UpdateInstanceConfigRequest["agents"]> = {};
  values.agents.forEach((agent) => {
    const code = agent.code.trim();
    if (!code) return;
    agents[code] = {
      name: agent.name.trim(),
      description: agent.description.trim(),
      base_url: agent.base_url.trim(),
      api_key: agent.api_key.trim(),
      model: agent.model.trim(),
      use_responses: agent.use_responses,
      context_window: agent.context_window,
    };
  });
  return {
    agents,
    agent_pool: values.agent_pool,
    agent_runtime: values.agent_runtime,
    lightrag: values.lightrag,
  };
}

export function SystemConfigPage() {
  const [values, setValues] = useState<ConfigFormValue | null>(null);
  const [savedValues, setSavedValues] = useState<ConfigFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getInstanceConfig();
      if (response.data) {
        const nextValues = toFormValue(response.data);
        setValues(nextValues);
        setSavedValues(cloneFormValue(nextValues));
      }
    } catch (error) {
      showApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const metrics = useMemo(() => {
    const agentCount = values?.agents.length ?? 0;
    return [
      { label: "Agents", value: agentCount },
      { label: "Pool Size", value: values?.agent_pool.max_size ?? "-" },
      { label: "Main Turns", value: values?.agent_runtime.main_max_turns ?? "-" },
      {
        label: "Graph / Chunks",
        value: values ? `${values.lightrag.graph_matches} / ${values.lightrag.chunk_matches}` : "-",
      },
    ];
  }, [values]);

  const updatePool = (patch: Partial<AgentPoolConfig>) => {
    setValues((current) => current && { ...current, agent_pool: { ...current.agent_pool, ...patch } });
  };

  const updateRuntime = (patch: Partial<AgentRuntimeConfig>) => {
    setValues((current) => current && { ...current, agent_runtime: { ...current.agent_runtime, ...patch } });
  };

  const updateLightRAG = (patch: Partial<LightRAGFormValue>) => {
    setValues((current) => current && { ...current, lightrag: { ...current.lightrag, ...patch } });
  };

  const updateAgent = (code: string, patch: Partial<AgentConfig>) => {
    setValues((current) => current && {
      ...current,
      agents: current.agents.map((agent) => (agent.code === code ? { ...agent, ...patch } : agent)),
    });
  };

  const handleCancel = useCallback(() => {
    if (savedValues) setValues(cloneFormValue(savedValues));
  }, [savedValues]);

  const handleSave = useCallback(async () => {
    if (!values || saving) return;

    setSaving(true);
    try {
      const response = await updateInstanceConfig(toPayload(values));
      showApiSuccess(response);
      if (response.data?.config) {
        const nextValues = toFormValue(response.data.config);
        setValues(nextValues);
        setSavedValues(cloneFormValue(nextValues));
      }
    } catch (error) {
      showApiError(error);
    } finally {
      setSaving(false);
    }
  }, [saving, values]);

  const headerActions = useMemo(() => (
    <>
      <Button icon={<X size={16} />} type="tertiary" disabled={!savedValues || saving || loading} onClick={handleCancel}>
        Cancel
      </Button>
      <Button icon={<Save size={16} />} theme="solid" type="primary" loading={saving} disabled={!values} onClick={handleSave}>
        Save
      </Button>
    </>
  ), [handleCancel, loading, savedValues, saving, values]);

  useAdminResourceHeader({
    refreshLabel: "Refresh config",
    loading,
    onRefresh: loadConfig,
    extraActions: headerActions,
    appendExtraActions: true,
  });

  return (
    <section className="system-config-page">
      <MetricStrip metrics={metrics} />

      <Spin spinning={loading} wrapperClassName="system-config-spin">
        {values ? (
          <div className="system-config-layout">
            <ConfigPanel icon={<Settings size={18} />} title="Runtime">
              <ConfigFieldGrid fields={RUNTIME_FIELDS} values={values.agent_runtime} onChange={updateRuntime} />
            </ConfigPanel>

            <ConfigPanel icon={<RotateCcw size={18} />} title="Agent Pool">
              <ConfigFieldGrid compact fields={POOL_FIELDS} values={values.agent_pool} onChange={updatePool} />
            </ConfigPanel>

            <ConfigPanel icon={<DatabaseZap size={18} />} title="LightRAG">
              <LightRAGConfigEditor value={values.lightrag} onChange={updateLightRAG} />
            </ConfigPanel>

            <ConfigPanel icon={<Bot size={18} />} title="Agents">
              <div className="agent-config-list">
                {values.agents.map((agent) => (
                  <AgentConfigEditor
                    key={agent.code}
                    agent={agent}
                    onChange={(patch) => updateAgent(agent.code, patch)}
                  />
                ))}
              </div>
            </ConfigPanel>
          </div>
        ) : null}
      </Spin>
    </section>
  );
}

function LightRAGConfigEditor({ value, onChange }: {
  value: LightRAGFormValue;
  onChange: (patch: Partial<LightRAGFormValue>) => void;
}) {
  return (
    <div className="config-grid lightrag-config-grid">
      <Field kind="text" label="Embedding API" value={value.embedding_api}
        onChange={(embedding_api) => onChange({ embedding_api })} />
      <Field kind="text" label="Embedding Key" value={value.embedding_key} password
        onChange={(embedding_key) => onChange({ embedding_key })} />
      <Field kind="text" label="Embedding Model" value={value.embedding_model}
        onChange={(embedding_model) => onChange({ embedding_model })} />
      <Field kind="number" label="Embedding Dimension" value={value.embedding_dim} min={1}
        onChange={(embedding_dim) => onChange({ embedding_dim })} />
      <Field kind="text" label="Extraction LLM API" value={value.llm_api}
        onChange={(llm_api) => onChange({ llm_api })} />
      <Field kind="text" label="Extraction LLM Key" value={value.llm_key} password
        onChange={(llm_key) => onChange({ llm_key })} />
      <Field kind="text" label="Extraction LLM Model" value={value.llm_model}
        onChange={(llm_model) => onChange({ llm_model })} />
      <Field kind="number" label="Graph Matches" value={value.graph_matches} min={1} max={50}
        onChange={(graph_matches) => onChange({ graph_matches })} />
      <Field kind="number" label="Chunk Matches" value={value.chunk_matches} min={1} max={50}
        onChange={(chunk_matches) => onChange({ chunk_matches })} />
    </div>
  );
}

function ConfigPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

function ConfigFieldGrid<T extends object>({ compact = false, fields, values, onChange }: {
  compact?: boolean;
  fields: ConfigField<T>[];
  values: T;
  onChange: (patch: Partial<T>) => void;
}) {
  return (
    <div className={cx("config-grid", compact && "compact")}>
      {fields.map((field) => {
        if (field.kind === "toggle") {
          return (
            <Field
              key={String(field.key)}
              kind="toggle"
              label={field.label}
              value={values[field.key] as boolean}
              onChange={(checked) => onChange({ [field.key]: checked } as Partial<T>)}
            />
          );
        }
        return (
          <Field
            key={String(field.key)}
            kind="number"
            label={field.label}
            value={values[field.key] as number}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(value) => onChange({ [field.key]: value } as Partial<T>)}
          />
        );
      })}
    </div>
  );
}

function AgentConfigEditor({ agent, onChange }: {
  agent: AgentFormValue;
  onChange: (patch: Partial<AgentConfig>) => void;
}) {
  return (
    <div className="agent-config-card">
      <div className="agent-config-card-header">
        <strong>{agent.name || agent.code || "New Agent"}</strong>
        <span>{agent.code}</span>
      </div>
      <div className="agent-form-grid">
        {AGENT_TEXT_FIELDS.map((field) => (
          <Field
            key={field.key}
            kind="text"
            label={field.label}
            value={agent[field.key]}
            maxLength={field.maxLength}
            password={field.password}
            onChange={(value) => onChange({ [field.key]: value })}
          />
        ))}
        <Field kind="number" label="Context Window" value={agent.context_window} min={0}
          onChange={(context_window) => onChange({ context_window })}
        />
        <Field kind="toggle" label="Use Responses API" value={agent.use_responses}
          onChange={(use_responses) => onChange({ use_responses })}
        />
        <label className="field full">
          <span>Description</span>
          <TextArea value={agent.description} autosize={{ minRows: 2, maxRows: 4 }} onChange={(description) => onChange({ description })} />
        </label>
      </div>
    </div>
  );
}

type FieldProps =
  | { kind: "text"; label: string; value: string; maxLength?: number; password?: boolean; onChange: (value: string) => void }
  | { kind: "number"; label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }
  | { kind: "toggle"; label: string; value: boolean; onChange: (value: boolean) => void };

function Field(props: FieldProps) {
  const className = props.kind === "toggle" ? "field switch-field" : "field";
  return (
    <label className={className}>
      <span>{props.label}</span>
      {props.kind === "text" ? (
        <Input type={props.password ? "password" : "text"} value={props.value} maxLength={props.maxLength} onChange={props.onChange} />
      ) : props.kind === "number" ? (
        <InputNumber
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(next) => typeof next === "number" && props.onChange(next)}
        />
      ) : (
        <Switch checked={props.value} onChange={props.onChange} aria-label={props.label} />
      )}
    </label>
  );
}
