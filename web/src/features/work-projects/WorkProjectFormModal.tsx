import { Button, Input, Select, TextArea } from "@douyinfe/semi-ui";
import { FolderKanban, Plus, ScanSearch, Server, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getWorkProjectAssetKinds,
  getWorkProjectTypes,
  isWorkProjectAssetKind,
  isWorkProjectType,
  WORK_PROJECT_ASSET_SCOPE,
} from "../../shared/api/contract";
import {
  WORK_PROJECT_ASSET_CRITICALITY,
  WORK_PROJECT_ASSET_CRITICALITY_VALUES,
  WORK_PROJECT_ASSET_KIND,
  WORK_PROJECT_ASSET_ORIGIN,
  WORK_PROJECT_ASSET_STATE,
} from "../../shared/api/generated/constants";
import { queryAvailableSandboxContainers } from "../../shared/api/sandboxContainers";
import { querySystemUsers } from "../../shared/api/systemUsers";
import type { CreateWorkProjectRequest, SandboxContainer, SystemUser, WorkProject, WorkProjectAssetRequest } from "../../shared/api/types";
import { FormField } from "../../shared/components/FormField";
import { OptionListSelect } from "../../shared/components/OptionListSelect";
import { ResourceModal } from "../../shared/components/ResourceModal";
import { useOptionList } from "../../shared/hooks/useOptionList";
import {
  WORK_PROJECT_ASSET_CRITICALITY_LABEL,
  WORK_PROJECT_ASSET_KIND_LABEL,
  WORK_PROJECT_TYPE_LABEL,
} from "../../shared/lib/labels";

type Props = {
  open: boolean;
  saving: boolean;
  project?: WorkProject | null;
  onCancel: () => void;
  onSubmit: (payload: CreateWorkProjectRequest) => Promise<void>;
};

type SelectedOption = { value?: number };
type AssetRow = WorkProjectAssetRequest & { existingId?: number };
type Values = Omit<CreateWorkProjectRequest, "assets"> & { assets: AssetRow[] };

const projectTypes = getWorkProjectTypes();
const assetKinds = getWorkProjectAssetKinds();
const emptyAsset = (): AssetRow => ({
  kind: assetKinds[0],
  locator: "",
  name: "",
  summary: "",
  scope: WORK_PROJECT_ASSET_SCOPE.IN_SCOPE,
  criticality: WORK_PROJECT_ASSET_CRITICALITY.UNKNOWN,
  state: WORK_PROJECT_ASSET_STATE.UNKNOWN,
});
const emptyValues = (): Values => ({
  name: "",
  description: "",
  owner_user_ids: [],
  sandbox_container_id: null,
  assets: [emptyAsset()],
  type: projectTypes[0],
});

export function WorkProjectFormModal({ open, saving, project, onCancel, onSubmit }: Props) {
  const [values, setValues] = useState<Values>(emptyValues);
  const loadContainers = useCallback((params: { page: number; size: number; keyword: string }) => queryAvailableSandboxContainers({ ...params, work_project_id: project?.id }), [project?.id]);
  const containers = useOptionList<SandboxContainer>({ enabled: open, query: loadContainers });
  const users = useOptionList<SystemUser>({ enabled: open, query: querySystemUsers });

  useEffect(() => {
    if (!open) return;
    setValues(project ? {
      name: project.name,
      description: project.description,
      owner_user_ids: project.owner_user_ids,
      sandbox_container_id: project.sandbox_container_id ?? null,
      assets: project.assets.filter((asset) => asset.origin === WORK_PROJECT_ASSET_ORIGIN.DECLARED).map((asset) => ({
        existingId: asset.id,
        kind: asset.kind,
        locator: asset.locator,
        name: asset.name,
        summary: asset.summary,
        scope: WORK_PROJECT_ASSET_SCOPE.IN_SCOPE,
        criticality: asset.criticality,
        state: asset.state,
      })),
      type: project.type,
    } : emptyValues());
  }, [open, project]);

  const userOptions = useMemo(() => users.items.map((user) => ({ label: user.username, value: user.id })), [users.items]);
  const containerOptions = useMemo(() => containers.items.map((container) => ({ label: container.container_name, value: container.id })), [containers.items]);
  const userNames = useMemo(() => new Map([
    ...(project?.owners.map((owner) => [owner.id, owner.username] as const) ?? []),
    ...users.knownItems.map((user) => [user.id, user.username] as const),
  ]), [project?.owners, users.knownItems]);
  const containerNames = useMemo(() => new Map([
    ...(project?.sandbox_container ? [[project.sandbox_container.id, project.sandbox_container.container_name] as const] : []),
    ...containers.knownItems.map((container) => [container.id, container.container_name] as const),
  ]), [containers.knownItems, project?.sandbox_container]);
  const updateAsset = (index: number, patch: Partial<AssetRow>) => setValues((current) => ({ ...current, assets: current.assets.map((asset, position) => position === index ? { ...asset, ...patch } : asset) }));
  const canSubmit = Boolean(values.name.trim()) && values.assets.length > 0 && values.assets.every((asset) => Boolean(asset.locator.trim()));

  const submit = () => onSubmit({
    ...values,
    name: values.name.trim(),
    description: values.description.trim(),
    assets: values.assets.map(({ existingId: _, ...asset }) => ({
      ...asset,
      locator: asset.locator.trim(),
      name: asset.name.trim(),
      summary: asset.summary.trim(),
      scope: WORK_PROJECT_ASSET_SCOPE.IN_SCOPE,
    })),
  });

  return (
    <ResourceModal open={open} title={project ? "Edit Work Project" : "Create Work Project"} titleIcon={<FolderKanban size={17} />} saving={saving} submitLabel={project ? "Save" : "Create"} submitDisabled={!canSubmit} size="wide" onCancel={onCancel} onSubmit={submit}>
      <div className="project-form-grid">
        <FormField label="Name"><Input prefix={<FolderKanban size={16} />} value={values.name} maxLength={255} required onChange={(name) => setValues((current) => ({ ...current, name }))} /></FormField>
        <FormField label="Type"><Select prefix={<ScanSearch size={16} />} value={values.type} optionList={projectTypes.map((type) => ({ label: WORK_PROJECT_TYPE_LABEL[type], value: type }))} onChange={(type) => isWorkProjectType(type) && setValues((current) => ({ ...current, type }))} /></FormField>
        <FormField label="Owners"><OptionListSelect source={users} prefix={<UserRound size={16} />} value={values.owner_user_ids} optionList={userOptions} placeholder={users.busy ? "Loading users" : "Select project owners"} emptyContent="No users" multiple showClear renderSelectedItem={(option: SelectedOption) => ({ isRenderInTag: true, content: userNames.get(Number(option.value)) ?? String(option.value ?? "") })} onChange={(value) => setValues((current) => ({ ...current, owner_user_ids: Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [] }))} /></FormField>
        <FormField label="Sandbox Container"><OptionListSelect source={containers} prefix={<Server size={16} />} value={values.sandbox_container_id ?? undefined} optionList={containerOptions} placeholder={containers.busy ? "Loading sandbox containers" : "Select sandbox container"} emptyContent="No running sandbox containers" showClear renderSelectedItem={(option: SelectedOption) => containerNames.get(Number(option.value)) ?? String(option.value ?? "")} onClear={() => setValues((current) => ({ ...current, sandbox_container_id: null }))} onChange={(value) => setValues((current) => ({ ...current, sandbox_container_id: typeof value === "number" ? value : null }))} /></FormField>
      </div>
      <FormField label="Description"><TextArea value={values.description} maxLength={2000} autosize={{ minRows: 3, maxRows: 6 }} onChange={(description) => setValues((current) => ({ ...current, description }))} /></FormField>
      <section className="project-assets-editor">
        <header><span>Declared Scope</span><Button icon={<Plus size={14} />} size="small" theme="borderless" type="tertiary" onClick={() => setValues((current) => ({ ...current, assets: [...current.assets, emptyAsset()] }))}>Add Asset</Button></header>
        <div className="project-assets-rows">
          {values.assets.map((asset, index) => (
            <article key={`${asset.existingId ?? "new"}:${index}`} className="project-asset-row">
              <FormField label="Kind"><Select value={asset.kind} disabled={Boolean(asset.existingId)} optionList={assetKinds.map((kind) => ({ label: WORK_PROJECT_ASSET_KIND_LABEL[kind], value: kind }))} onChange={(kind) => isWorkProjectAssetKind(kind) && updateAsset(index, { kind, locator: "" })} /></FormField>
              <FormField label="Canonical Locator"><Input value={asset.locator} maxLength={1000} required placeholder={locatorPlaceholder(asset.kind)} onChange={(locator) => updateAsset(index, { locator })} /></FormField>
              <FormField label="Name"><Input value={asset.name} maxLength={255} onChange={(name) => updateAsset(index, { name })} /></FormField>
              <FormField label="Criticality"><Select value={asset.criticality} optionList={WORK_PROJECT_ASSET_CRITICALITY_VALUES.map((value) => ({ label: WORK_PROJECT_ASSET_CRITICALITY_LABEL[value], value }))} onChange={(criticality) => WORK_PROJECT_ASSET_CRITICALITY_VALUES.includes(criticality as never) && updateAsset(index, { criticality: criticality as AssetRow["criticality"] })} /></FormField>
              <Button icon={<Trash2 size={14} />} theme="borderless" type="danger" disabled={values.assets.length <= 1} aria-label="Remove asset" onClick={() => setValues((current) => ({ ...current, assets: current.assets.filter((_, position) => position !== index) }))} />
            </article>
          ))}
        </div>
      </section>
    </ResourceModal>
  );
}

function locatorPlaceholder(kind: AssetRow["kind"]): string {
  if (kind === WORK_PROJECT_ASSET_KIND.NETWORK) return "10.0.0.0/24";
  if (kind === WORK_PROJECT_ASSET_KIND.SERVICE) return "https://app.example.com:443";
  if (kind === WORK_PROJECT_ASSET_KIND.ENDPOINT) return "https://app.example.com/api/v1";
  if (kind === WORK_PROJECT_ASSET_KIND.ARTIFACT) return "sha256:<digest> or stable file reference";
  return `Canonical ${WORK_PROJECT_ASSET_KIND_LABEL[kind].toLowerCase()} identifier`;
}
