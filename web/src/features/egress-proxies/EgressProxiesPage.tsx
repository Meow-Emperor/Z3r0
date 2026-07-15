import { Tag, Toast, Tooltip } from "@douyinfe/semi-ui";
import { Network, Pencil, Server, Wifi } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createEgressProxy, deleteEgressProxy, queryEgressProxies, testEgressProxy, updateEgressProxy } from "../../shared/api/egressProxies";
import { showApiError } from "../../shared/api/feedback";
import { EGRESS_PROXY_TYPE, EGRESS_PROXY_TYPE_VALUES } from "../../shared/api/generated/constants";
import type { CreateEgressProxyRequest, EgressProxy, UpdateEgressProxyRequest } from "../../shared/api/types";
import { PagedResourceTable } from "../../shared/components/PagedResourceTable";
import type { ResourceColumn } from "../../shared/components/ResourceTable";
import { DeleteRowAction, OwnerCell, ResourceIdentity, RowActionButton, RowActions, SecretCell } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { useVisibleResourceIds } from "../../shared/hooks/useVisibleResourceIds";
import { formatDateTime } from "../../shared/lib/date";
import { countBy } from "../../shared/lib/array";
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

  const summary = useMemo(() => countBy(proxies.items, EGRESS_PROXY_TYPE_VALUES, (proxy) => proxy.proxy_type), [proxies.items]);

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
            <RowActionButton icon={<Wifi size={15} />} label={`Test ${proxy.proxy_host}`}
              loading={testingId === proxy.id}
              onClick={() => void testProxy(proxy)}
            />
          </Tooltip>
          <RowActionButton icon={<Pencil size={15} />} label={`Edit ${proxy.proxy_host}`}
            onClick={() => setModal({ mode: "edit", proxy })}
          />
          <DeleteRowAction title="Delete egress proxy" content={`Delete ${proxy.proxy_host}:${proxy.proxy_port}?`} label={`Delete ${proxy.proxy_host}`}
            loading={deletingId === proxy.id} onConfirm={() => void deleteProxy(proxy)}
          />
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

      <EgressProxyFormModal
        open={Boolean(modal)}
        proxy={modal?.mode === "edit" ? modal.proxy : null}
        saving={saving}
        onCancel={() => setModal(null)}
        onCreate={(payload: CreateEgressProxyRequest) => submit(() => createEgressProxy(payload))}
        onUpdate={(proxy, payload: UpdateEgressProxyRequest) => submit(() => updateEgressProxy(proxy.id, payload))}
      />
    </>
  );
}
