import { Button, Input, InputNumber, Switch, TextArea } from "@douyinfe/semi-ui";
import { Bot, DatabaseZap, RotateCcw, Save, Settings, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getInstanceConfig, updateInstanceConfig } from "../../shared/api/systemConfig";
import { showApiError, showApiSuccess } from "../../shared/api/feedback";
import { SYSTEM_CONFIG_FIELD_CONSTRAINTS } from "../../shared/api/generated/constants";
import { MetricStrip } from "../../shared/components/ResourcePageShell";
import { AsyncContent } from "../../shared/components/AsyncContent";
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

type NumberFieldWidth = "compact" | "standard" | "wide" | "fill";

type ConfigField<T> = {
  key: FieldKey<T, number>;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  width?: NumberFieldWidth;
};

type ConfigFieldGroup<T> = {
  title: string;
  fields: ConfigField<T>[];
};

type AgentTextField = {
  key: keyof Pick<AgentConfig, "name" | "base_url" | "model" | "api_key">;
  label: string;
  maxLength?: number;
  password?: boolean;
};

const AGENT_CONSTRAINTS = SYSTEM_CONFIG_FIELD_CONSTRAINTS.AgentConfig;
const POOL_CONSTRAINTS = SYSTEM_CONFIG_FIELD_CONSTRAINTS.AgentPoolConfig;
const RUNTIME_CONSTRAINTS = SYSTEM_CONFIG_FIELD_CONSTRAINTS.AgentRuntimeConfig;
const LIGHTRAG_CONSTRAINTS = SYSTEM_CONFIG_FIELD_CONSTRAINTS.LightRAGConfig;
const RATIO_STEP = 0.01;

const RUNTIME_FIELD_GROUPS: ConfigFieldGroup<AgentRuntimeConfig>[] = [
  {
    title: "Execution",
    fields: [
      { key: "main_max_turns", label: "Main Max Turns", min: RUNTIME_CONSTRAINTS.main_max_turns.minimum },
      { key: "subordinate_max_turns", label: "Subordinate Max Turns", min: RUNTIME_CONSTRAINTS.subordinate_max_turns.minimum },
      { key: "model_stream_idle_timeout_seconds", label: "Stream Idle Timeout", min: RUNTIME_CONSTRAINTS.model_stream_idle_timeout_seconds.minimum },
      { key: "report_retention_seconds", label: "Report Retention Seconds", min: RUNTIME_CONSTRAINTS.report_retention_seconds.minimum },
    ],
  },
  {
    title: "Context Thresholds",
    fields: [
      ratioField("context_budget_model_call_ratio", "Model Call Budget"),
      ratioField("context_compression_trigger_ratio", "Trigger Ratio"),
      ratioField("context_compression_hard_stop_ratio", "Hard Stop Ratio"),
      ratioField("context_compression_target_ratio", "Target Ratio"),
    ],
  },
  {
    title: "Compression Policy",
    fields: [
      ratioField("context_compression_preserve_recent_ratio", "Preserve Recent Ratio"),
      { key: "context_compression_preserve_recent_items", label: "Preserve Recent Items", min: RUNTIME_CONSTRAINTS.context_compression_preserve_recent_items.minimum, width: "compact" },
      { key: "context_compression_min_items", label: "Minimum Items", min: RUNTIME_CONSTRAINTS.context_compression_min_items.minimum, width: "compact" },
      { key: "context_compression_summary_max_tokens", label: "Summary Max Tokens", min: RUNTIME_CONSTRAINTS.context_compression_summary_max_tokens.minimum },
    ],
  },
];

const POOL_FIELDS: ConfigField<AgentPoolConfig>[] = [
  { key: "max_size", label: "Max Size", min: POOL_CONSTRAINTS.max_size.minimum, width: "compact" },
  { key: "ttl_seconds", label: "TTL Seconds", min: POOL_CONSTRAINTS.ttl_seconds.minimum },
  { key: "sweep_interval_seconds", label: "Sweep Interval Seconds", min: POOL_CONSTRAINTS.sweep_interval_seconds.minimum, width: "compact" },
];

const AGENT_TEXT_FIELDS: AgentTextField[] = [
  { key: "name", label: "Name", maxLength: AGENT_CONSTRAINTS.name.maxLength },
  { key: "model", label: "Model" },
  { key: "base_url", label: "Base URL" },
  { key: "api_key", label: "API Key", password: true },
];

function ratioField(
  key: FieldKey<AgentRuntimeConfig, number>,
  label: string,
): ConfigField<AgentRuntimeConfig> {
  const constraints = RUNTIME_CONSTRAINTS[key as keyof typeof RUNTIME_CONSTRAINTS];
  if (!("exclusiveMinimum" in constraints) || !("exclusiveMaximum" in constraints)) {
    throw new Error(`missing ratio constraints for ${String(key)}`);
  }
  return {
    key,
    label,
    min: constraints.exclusiveMinimum + RATIO_STEP,
    max: constraints.exclusiveMaximum - RATIO_STEP,
    step: RATIO_STEP,
    width: "compact",
  };
}

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
    lightrag: {
      ...values.lightrag,
      embedding_api: values.lightrag.embedding_api.trim(),
      embedding_key: values.lightrag.embedding_key.trim(),
      embedding_model: values.lightrag.embedding_model.trim(),
      llm_api: values.lightrag.llm_api.trim(),
      llm_key: values.lightrag.llm_key.trim(),
      llm_model: values.lightrag.llm_model.trim(),
    },
  };
}

export function SystemConfigPage() {
  const [values, setValues] = useState<ConfigFormValue | null>(null);
  const [savedValues, setSavedValues] = useState<ConfigFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      saveRequestIdRef.current += 1;
      savingRef.current = false;
    };
  }, []);

  const loadConfig = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await getInstanceConfig();
      if (mountedRef.current && loadRequestIdRef.current === requestId && response.data) {
        const nextValues = toFormValue(response.data);
        setValues(nextValues);
        setSavedValues(cloneFormValue(nextValues));
      }
    } catch (error) {
      if (mountedRef.current && loadRequestIdRef.current === requestId) showApiError(error);
    } finally {
      if (mountedRef.current && loadRequestIdRef.current === requestId) setLoading(false);
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
    if (!values || savingRef.current) return;

    savingRef.current = true;
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSaving(true);
    try {
      const response = await updateInstanceConfig(toPayload(values));
      if (!mountedRef.current || saveRequestIdRef.current !== requestId) return;
      showApiSuccess(response);
      if (response.data?.config) {
        const nextValues = toFormValue(response.data.config);
        setValues(nextValues);
        setSavedValues(cloneFormValue(nextValues));
      }
    } catch (error) {
      if (mountedRef.current && saveRequestIdRef.current === requestId) showApiError(error);
    } finally {
      if (saveRequestIdRef.current === requestId) {
        savingRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    }
  }, [values]);

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
    loading: loading || saving,
    onRefresh: loadConfig,
    extraActions: headerActions,
    appendExtraActions: true,
  });

  return (
    <section className="system-config-page">
      <MetricStrip metrics={metrics} />

      <div className="system-config-workspace">
        <AsyncContent
          loading={loading}
          empty={values === null}
          emptyIcon={<Settings size={42} />}
          emptyTitle="Configuration is unavailable"
          wrapperClassName="system-config-spin"
        >
          {values ? (
            <div className="system-config-layout">
              <ConfigPanel icon={<Settings size={18} />} title="Runtime">
                <RuntimeConfigEditor value={values.agent_runtime} onChange={updateRuntime} />
              </ConfigPanel>

              <ConfigPanel icon={<RotateCcw size={18} />} title="Agent Pool">
                <ConfigFieldGrid fill fields={POOL_FIELDS} values={values.agent_pool} onChange={updatePool} />
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
        </AsyncContent>
      </div>
    </section>
  );
}

function RuntimeConfigEditor({ value, onChange }: {
  value: AgentRuntimeConfig;
  onChange: (patch: Partial<AgentRuntimeConfig>) => void;
}) {
  return (
    <div className="runtime-config-groups">
      {RUNTIME_FIELD_GROUPS.map((group) => (
        <section key={group.title} className="runtime-config-group">
          <h3>{group.title}</h3>
          <ConfigFieldGrid fields={group.fields} values={value} onChange={onChange} />
        </section>
      ))}
    </div>
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
      <Field kind="number" label="Embedding Dimension" value={value.embedding_dim}
        width="fill"
        min={LIGHTRAG_CONSTRAINTS.embedding_dim.minimum} max={LIGHTRAG_CONSTRAINTS.embedding_dim.maximum}
        onChange={(embedding_dim) => onChange({ embedding_dim })} />
      <Field kind="text" label="Extraction LLM API" value={value.llm_api}
        onChange={(llm_api) => onChange({ llm_api })} />
      <Field kind="text" label="Extraction LLM Key" value={value.llm_key} password
        onChange={(llm_key) => onChange({ llm_key })} />
      <Field kind="text" label="Extraction LLM Model" value={value.llm_model}
        onChange={(llm_model) => onChange({ llm_model })} />
      <div className="lightrag-retrieval-fields">
        <Field kind="number" label="Graph Matches" value={value.graph_matches} width="fill"
          min={LIGHTRAG_CONSTRAINTS.graph_matches.minimum} max={LIGHTRAG_CONSTRAINTS.graph_matches.maximum}
          onChange={(graph_matches) => onChange({ graph_matches })} />
        <Field kind="number" label="Chunk Matches" value={value.chunk_matches} width="fill"
          min={LIGHTRAG_CONSTRAINTS.chunk_matches.minimum} max={LIGHTRAG_CONSTRAINTS.chunk_matches.maximum}
          onChange={(chunk_matches) => onChange({ chunk_matches })} />
      </div>
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

function ConfigFieldGrid<T extends object>({ fill = false, fields, values, onChange }: {
  fill?: boolean;
  fields: ConfigField<T>[];
  values: T;
  onChange: (patch: Partial<T>) => void;
}) {
  return (
    <div className={cx("config-value-grid", fill && "config-value-grid-fill")}>
      {fields.map((field) => (
        <Field
          key={String(field.key)}
          kind="number"
          label={field.label}
          value={values[field.key] as number}
          min={field.min}
          max={field.max}
          step={field.step}
          width={field.width}
          onChange={(value) => onChange({ [field.key]: value } as Partial<T>)}
        />
      ))}
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
        <Field kind="number" label="Context Window" value={agent.context_window} min={AGENT_CONSTRAINTS.context_window.minimum} width="wide"
          onChange={(context_window) => onChange({ context_window })}
        />
        <Field kind="toggle" label="Use Responses API" value={agent.use_responses}
          onChange={(use_responses) => onChange({ use_responses })}
        />
        <label className="field full">
          <span>Description</span>
          <TextArea value={agent.description} autosize={{ minRows: 1, maxRows: 3 }} onChange={(description) => onChange({ description })} />
        </label>
      </div>
    </div>
  );
}

type FieldProps =
  | { kind: "text"; label: string; value: string; maxLength?: number; password?: boolean; onChange: (value: string) => void }
  | {
      kind: "number";
      label: string;
      value: number;
      min?: number;
      max?: number;
      step?: number;
      width?: NumberFieldWidth;
      onChange: (value: number) => void;
    }
  | { kind: "toggle"; label: string; value: boolean; onChange: (value: boolean) => void };

function Field(props: FieldProps) {
  const className = cx(
    "field",
    props.kind === "toggle" && "switch-field",
    props.kind === "number" && "number-field",
    props.kind === "number" && `number-field-${props.width ?? "standard"}`,
  );
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
