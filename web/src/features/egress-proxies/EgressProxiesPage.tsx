import { Button, Popconfirm, Tag, Toast, Tooltip } from "@douyinfe/semi-ui";
import { Network, Pencil, Server, Trash2, Wifi } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createEgressProxy, deleteEgressProxy, queryEgressProxies, testEgressProxy, updateEgressProxy } from "../../shared/api/egressProxies";
import { showApiError } from "../../shared/api/feedback";
import { EGRESS_PROXY_TYPE, EGRESS_PROXY_TYPE_VALUES } from "../../shared/api/generated/constants";
import type { CreateEgressProxyRequest, EgressProxy, UpdateEgressProxyRequest } from "../../shared/api/types";
import { PagedResourceTable } from "../../shared/components/PagedResourceTable";
import type { ResourceColumn } from "../../shared/components/ResourceTable";
import { OwnerCell, ResourceIdentity, RowActions, SecretCell } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { useVisibleResourceIds } from "../../shared/hooks/useVisibleResourceIds";
import { formatDateTime } from "../../shared/lib/date";
import { UI_TEXT } from "../../shared/lib/uiText";
import { EgressProxyFormModal } from "./EgressProxyFormModal";

type ModalState = { mode: "create" } | { mode: "edit"; proxy: EgressProxy } | null;

export function EgressProxiesPage() {
  const proxies = usePagedResourceList<EgressProxy>({ query: queryEgressProxies });
  const [modal, setModal] = useState<ModalState>(null);
  const secrets = useVisibleResourceIds(proxies.items);
  const [testingId, setTestingId] = useState<number | null>(null);
  const testingRef = useRef(false);

  const { run: deleteProxy, busyId: deletingId } = useResourceAction<EgressProxy>(
    (proxy) => deleteEgressProxy(proxy.id), proxies.loadItems,
  );

  useAdminResourceHeader({
    createLabel: "Create Egress Proxy",
    refreshLabel: "Refresh egress proxies",
    loading: proxies.loading,
    onCreate: () => setModal({ mode: "create" }),
    onRefresh: proxies.loadItems,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModal(null);
      await proxies.loadItems();
    },
  });

  const summary = useMemo(
    () => proxies.items.reduce((acc, proxy) => ({
      ...acc,
      [proxy.proxy_type]: (acc[proxy.proxy_type] ?? 0) + 1,
    }), Object.fromEntries(EGRESS_PROXY_TYPE_VALUES.map((type) => [type, 0])) as Record<EgressProxy["proxy_type"], number>),
    [proxies.items],
  );

  const testProxy = async (proxy: EgressProxy) => {
    if (testingRef.current) return;
    testingRef.current = true;
    setTestingId(proxy.id);
    try {
      const response = await testEgressProxy(proxy.id);
      const result = response.data;
      if (!result) return;
      const message = `${result.message} (${result.elapsed_ms} ms)`;
      if (result.success) Toast.success(message);
      else Toast.error(message);
    } catch (error) {
      showApiError(error);
    } finally {
      testingRef.current = false;
      setTestingId(null);
    }
  };

  const columns: ResourceColumn<EgressProxy>[] = [
    {
      key: "proxy", header: "Proxy", width: "minmax(0, 0.8fr)",
      render: (proxy) => (
        <ResourceIdentity
          icon={<Network size={18} />}
          title={`${proxy.proxy_host}:${proxy.proxy_port}`}
          detail={<><Server size={13} />{proxy.proxy_type.toUpperCase()}</>}
        />
      ),
    },
    {
      key: "type", header: "Type", width: "96px",
      render: (proxy) => <Tag color={proxy.proxy_type === EGRESS_PROXY_TYPE.SOCKS5 ? "violet" : "blue"}>{proxy.proxy_type.toUpperCase()}</Tag>,
    },
    {
      key: "account", header: "Account", width: "minmax(0, 0.5fr)",
      render: (proxy) => <OwnerCell>{proxy.proxy_account || "-"}</OwnerCell>,
    },
    {
      key: "password", header: "Password", width: "minmax(0, 0.55fr)",
      render: (proxy) => (
        <SecretCell id={proxy.proxy_host} value={proxy.proxy_password} visible={secrets.isVisible(proxy.id)} onToggle={() => secrets.toggle(proxy.id)} />
      ),
    },
    { key: "updated", header: "Updated", width: "minmax(0, 0.55fr)", render: (proxy) => formatDateTime(proxy.updated_at) },
    {
      key: "actions", header: "Actions", width: "136px",
      render: (proxy) => (
        <RowActions>
          <Tooltip content="Test proxy">
            <Button icon={<Wifi size={15} />} theme="borderless" type="tertiary"
              loading={testingId === proxy.id}
              aria-label={`Test ${proxy.proxy_host}`}
              onClick={() => void testProxy(proxy)}
            />
          </Tooltip>
          <Button icon={<Pencil size={15} />} theme="borderless" type="tertiary"
            aria-label={`Edit ${proxy.proxy_host}`} onClick={() => setModal({ mode: "edit", proxy })}
          />
          <Popconfirm title="Delete egress proxy" content={`Delete ${proxy.proxy_host}:${proxy.proxy_port}?`} okType="danger" cancelText={UI_TEXT.cancel} onConfirm={() => void deleteProxy(proxy)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingId === proxy.id} aria-label={`Delete ${proxy.proxy_host}`}
            />
          </Popconfirm>
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PagedResourceTable
        ariaLabel="Egress proxies"
        columns={columns}
        rows={proxies.items}
        rowKey={(proxy) => proxy.id}
        searchPlaceholder="Search host, account, type, or port"
        state={proxies}
        metrics={[
          { label: "Total", value: proxies.total },
          ...EGRESS_PROXY_TYPE_VALUES.map((type) => ({ label: type.toUpperCase(), value: summary[type] ?? 0 })),
        ]}
        emptyIcon={<Network size={42} />}
        emptyTitle="No egress proxies found"
      />

      {modal?.mode === "edit" ? (
        <EgressProxyFormModal
          open mode="edit" proxy={modal.proxy} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: UpdateEgressProxyRequest) => submit(() => updateEgressProxy(modal.proxy.id, payload))}
        />
      ) : (
        <EgressProxyFormModal
          open={modal?.mode === "create"} mode="create" proxy={null} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: CreateEgressProxyRequest) => submit(() => createEgressProxy(payload))}
        />
      )}
    </>
  );
}
