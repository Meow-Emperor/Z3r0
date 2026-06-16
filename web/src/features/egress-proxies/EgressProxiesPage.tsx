import { Button, Popconfirm, Tag, Toast, Tooltip } from "@douyinfe/semi-ui";
import { Eye, EyeOff, Network, Pencil, Server, Trash2, User, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createEgressProxy, deleteEgressProxy, queryEgressProxies, testEgressProxy, updateEgressProxy } from "../../shared/api/egressProxies";
import { showApiError } from "../../shared/api/feedback";
import { EGRESS_PROXY_TYPE } from "../../shared/api/generated/constants";
import type { CreateEgressProxyRequest, EgressProxy, UpdateEgressProxyRequest } from "../../shared/api/types";
import { ResourcePageShell } from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { UI_TEXT } from "../../shared/lib/uiText";
import { EgressProxyFormModal } from "./EgressProxyFormModal";

type ModalState = { mode: "create" } | { mode: "edit"; proxy: EgressProxy } | null;

export function EgressProxiesPage() {
  const {
    items: proxies, page, keyword, loading, loadItems: loadProxies, total, rangeStart, rangeEnd,
    setKeyword, search, previous, next, canGoBack, canGoNext,
  } = usePagedResourceList<EgressProxy>({ query: queryEgressProxies });
  const [modal, setModal] = useState<ModalState>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(() => new Set());
  const [testingId, setTestingId] = useState<number | null>(null);

  const { run: deleteProxy, busyId: deletingId } = useResourceAction<EgressProxy>(
    (proxy) => deleteEgressProxy(proxy.id), loadProxies,
  );

  useAdminResourceHeader({
    createLabel: "Create Egress Proxy",
    refreshLabel: "Refresh egress proxies",
    loading,
    onCreate: () => setModal({ mode: "create" }),
    onRefresh: loadProxies,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModal(null);
      await loadProxies();
    },
  });

  useEffect(() => {
    const proxyIds = new Set(proxies.map((proxy) => proxy.id));
    setVisiblePasswords((current) => {
      const next = new Set([...current].filter((id) => proxyIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [proxies]);

  const summary = useMemo(
    () => proxies.reduce(
      (acc, proxy) => ({
        http: acc.http + (proxy.proxy_type === EGRESS_PROXY_TYPE.HTTP ? 1 : 0),
        https: acc.https + (proxy.proxy_type === EGRESS_PROXY_TYPE.HTTPS ? 1 : 0),
        socks5: acc.socks5 + (proxy.proxy_type === EGRESS_PROXY_TYPE.SOCKS5 ? 1 : 0),
      }),
      { http: 0, https: 0, socks5: 0 },
    ),
    [proxies],
  );

  const togglePassword = (proxyId: number) => {
    setVisiblePasswords((current) => {
      const next = new Set(current);
      if (next.has(proxyId)) next.delete(proxyId);
      else next.add(proxyId);
      return next;
    });
  };

  const testProxy = async (proxy: EgressProxy) => {
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
      setTestingId(null);
    }
  };

  const columns: ResourceColumn<EgressProxy>[] = [
    {
      key: "proxy", header: "Proxy", width: "minmax(0, 0.8fr)",
      render: (proxy) => (
        <div className="container-identity">
          <div className="resource-avatar"><Network size={18} /></div>
          <div>
            <strong>{proxy.proxy_host}:{proxy.proxy_port}</strong>
            <span><Server size={13} />{proxy.proxy_type.toUpperCase()}</span>
          </div>
        </div>
      ),
    },
    {
      key: "type", header: "Type", width: "96px",
      render: (proxy) => <Tag color={proxy.proxy_type === EGRESS_PROXY_TYPE.SOCKS5 ? "violet" : "blue"}>{proxy.proxy_type.toUpperCase()}</Tag>,
    },
    {
      key: "account", header: "Account", width: "minmax(0, 0.5fr)",
      render: (proxy) => <span className="owner-cell"><User size={13} />{proxy.proxy_account || "-"}</span>,
    },
    {
      key: "password", header: "Password", width: "minmax(0, 0.55fr)",
      render: (proxy) => {
        const visible = visiblePasswords.has(proxy.id);
        return (
          <div className="host-password-cell">
            <code>{visible ? (proxy.proxy_password || "-") : maskPassword(proxy.proxy_password)}</code>
            <Tooltip content={visible ? "Hide password" : "Show password"}>
              <Button icon={visible ? <EyeOff size={14} /> : <Eye size={14} />} theme="borderless"
                aria-label={visible ? `Hide password for ${proxy.proxy_host}` : `Show password for ${proxy.proxy_host}`}
                onClick={() => togglePassword(proxy.id)}
              />
            </Tooltip>
          </div>
        );
      },
    },
    { key: "updated", header: "Updated", width: "minmax(0, 0.55fr)", render: (proxy) => formatDateTime(proxy.updated_at) },
    {
      key: "actions", header: "Actions", width: "136px",
      render: (proxy) => (
        <div className="row-actions">
          <Tooltip content="Test proxy">
            <Button icon={<Wifi size={15} />} theme="borderless"
              loading={testingId === proxy.id}
              aria-label={`Test ${proxy.proxy_host}`}
              onClick={() => void testProxy(proxy)}
            />
          </Tooltip>
          <Button icon={<Pencil size={15} />} theme="borderless"
            aria-label={`Edit ${proxy.proxy_host}`} onClick={() => setModal({ mode: "edit", proxy })}
          />
          <Popconfirm title="Delete egress proxy" content={`Delete ${proxy.proxy_host}:${proxy.proxy_port}?`} okType="danger" cancelText={UI_TEXT.cancel} onConfirm={() => void deleteProxy(proxy)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingId === proxy.id} aria-label={`Delete ${proxy.proxy_host}`}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <>
      <ResourcePageShell
        searchPlaceholder="Search host, account, type, or port"
        keyword={keyword}
        loading={loading}
        metrics={[
          { label: "Total", value: total },
          { label: "HTTP", value: summary.http },
          { label: "HTTPS", value: summary.https },
          { label: "SOCKS5", value: summary.socks5 },
        ]}
        empty={proxies.length === 0}
        emptyIcon={<Network size={42} />}
        emptyTitle="No egress proxies found"
        page={page}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        onKeywordChange={setKeyword}
        onSearch={search}
        onPrevious={previous}
        onNext={next}
      >
        <ResourceTable<EgressProxy>
          ariaLabel="Egress proxies"
          columns={columns}
          rows={proxies}
          rowKey={(proxy) => proxy.id}
        />
      </ResourcePageShell>

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

function maskPassword(password: string) {
  if (!password) return "-";
  return "********";
}
