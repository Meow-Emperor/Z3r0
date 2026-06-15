import { Button, Popconfirm, Tooltip } from "@douyinfe/semi-ui";
import { Eye, EyeOff, Pencil, Server, SquareTerminal, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createManagedHost, deleteManagedHost, queryManagedHosts, updateManagedHost } from "../../shared/api/hosts";
import type { CreateManagedHostRequest, ManagedHost, UpdateManagedHostRequest } from "../../shared/api/types";
import { ResourcePageShell } from "../../shared/components/ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "../../shared/components/ResourceTable";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { useContainerShell } from "../container-shell/ContainerShellProvider";
import { HostFormModal } from "./HostFormModal";

type ModalState = { mode: "create" } | { mode: "edit"; host: ManagedHost } | null;

export function HostsPage() {
  const {
    items: hosts, page, keyword, loading, loadItems: loadHosts, total, rangeStart, rangeEnd,
    setKeyword, search, previous, next, canGoBack, canGoNext,
  } = usePagedResourceList<ManagedHost>({ query: queryManagedHosts });
  const [modal, setModal] = useState<ModalState>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(() => new Set());
  const { openHostShell } = useContainerShell();
  const { run: deleteHost, busyId: deletingHostId } = useResourceAction<ManagedHost>(
    (host) => deleteManagedHost(host.id),
    loadHosts,
  );

  useAdminResourceHeader({
    createLabel: "Create Host",
    refreshLabel: "Refresh hosts",
    loading,
    onCreate: () => setModal({ mode: "create" }),
    onRefresh: loadHosts,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModal(null);
      await loadHosts();
    },
  });

  useEffect(() => {
    const hostIds = new Set(hosts.map((host) => host.id));
    setVisiblePasswords((current) => {
      const next = new Set([...current].filter((id) => hostIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [hosts]);

  const summary = useMemo(
    () => hosts.reduce(
      (acc, host) => ({
        ssh: acc.ssh + (host.ssh_port > 0 ? 1 : 0),
        docker: acc.docker + (host.docker_management_port > 0 ? 1 : 0),
      }),
      { ssh: 0, docker: 0 },
    ),
    [hosts],
  );

  const togglePassword = (hostId: number) => {
    setVisiblePasswords((current) => {
      const next = new Set(current);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      return next;
    });
  };

  const columns: ResourceColumn<ManagedHost>[] = [
    {
      key: "host", header: "Host", width: "minmax(160px, 0.5fr)",
      render: (host) => (
        <div className="container-identity">
          <div className="resource-avatar"><Server size={18} /></div>
          <div>
            <strong>{host.ip_address}</strong>
            <span>SSH {host.ssh_port}</span>
          </div>
        </div>
      ),
    },
    {
      key: "account", header: "Account", width: "minmax(100px, 0.32fr)",
      render: (host) => <span className="owner-cell"><User size={13} />{host.host_account}</span>,
    },
    {
      key: "password", header: "Password", width: "minmax(130px, 0.36fr)",
      render: (host) => {
        const visible = visiblePasswords.has(host.id);
        return (
          <div className="host-password-cell">
            <code>{visible ? host.host_password : maskPassword(host.host_password)}</code>
            <Tooltip content={visible ? "Hide password" : "Show password"}>
              <Button icon={visible ? <EyeOff size={14} /> : <Eye size={14} />} theme="borderless"
                aria-label={visible ? `Hide password for ${host.ip_address}` : `Show password for ${host.ip_address}`}
                onClick={() => togglePassword(host.id)}
              />
            </Tooltip>
          </div>
        );
      },
    },
    {
      key: "docker", header: "Docker Port", width: "120px",
      render: (host) => host.docker_management_port,
    },
    { key: "updated", header: "Updated", width: "minmax(210px, 0.62fr)", render: (host) => formatDateTime(host.updated_at) },
    {
      key: "actions", header: "Actions", width: "112px",
      render: (host) => (
        <div className="row-actions">
          <Button icon={<SquareTerminal size={15} />} theme="borderless"
            aria-label={`Connect shell for ${host.ip_address}`} onClick={() => openHostShell(host)}
          />
          <Button icon={<Pencil size={15} />} theme="borderless"
            aria-label={`Edit ${host.ip_address}`} onClick={() => setModal({ mode: "edit", host })}
          />
          <Popconfirm title="Delete host" content={`Delete ${host.ip_address}?`} okType="danger" onConfirm={() => void deleteHost(host)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingHostId === host.id} aria-label={`Delete ${host.ip_address}`}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <>
      <ResourcePageShell
        searchPlaceholder="Search IP, account, SSH port, or Docker port"
        keyword={keyword}
        loading={loading}
        metrics={[
          { label: "Total", value: total },
          { label: "SSH", value: summary.ssh },
          { label: "Docker Ports", value: summary.docker },
        ]}
        empty={hosts.length === 0}
        emptyIcon={<Server size={42} />}
        emptyTitle="No hosts found"
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
        <ResourceTable<ManagedHost>
          ariaLabel="Managed hosts"
          columns={columns}
          rows={hosts}
          rowKey={(host) => host.id}
        />
      </ResourcePageShell>

      {modal?.mode === "edit" ? (
        <HostFormModal
          open mode="edit" host={modal.host} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: UpdateManagedHostRequest) => submit(() => updateManagedHost(modal.host.id, payload))}
        />
      ) : (
        <HostFormModal
          open={modal?.mode === "create"} mode="create" host={null} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: CreateManagedHostRequest) => submit(() => createManagedHost(payload))}
        />
      )}
    </>
  );
}

function maskPassword(password: string) {
  return password ? "*".repeat(Math.min(Math.max(password.length, 6), 16)) : "-";
}
