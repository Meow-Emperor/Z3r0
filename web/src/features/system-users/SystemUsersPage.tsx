import { Button, Popconfirm, Tag } from "@douyinfe/semi-ui";
import { Pencil, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { createSystemUser, deleteSystemUser, querySystemUsers, updateSystemUser } from "../../shared/api/systemUsers";
import { SYSTEM_USER_ROLE } from "../../shared/api/generated/constants";
import type { CreateSystemUserRequest, SystemUser, UpdateSystemUserRequest } from "../../shared/api/types";
import { PagedResourceTable } from "../../shared/components/PagedResourceTable";
import type { ResourceColumn } from "../../shared/components/ResourceTable";
import { ResourceIdentity, RowActions } from "../../shared/components/ResourceCells";
import { useAdminResourceHeader } from "../../shared/hooks/useAdminResourceHeader";
import { usePagedResourceList } from "../../shared/hooks/usePagedResourceList";
import { useResourceAction } from "../../shared/hooks/useResourceAction";
import { useResourceSubmit } from "../../shared/hooks/useResourceSubmit";
import { formatDateTime } from "../../shared/lib/date";
import { SYSTEM_USER_ROLE_COLOR, SYSTEM_USER_ROLE_LABEL } from "../../shared/lib/labels";
import { UI_TEXT } from "../../shared/lib/uiText";
import { UserFormModal } from "./UserFormModal";

type ModalState = { mode: "create" } | { mode: "edit"; user: SystemUser } | null;

export function SystemUsersPage() {
  const users = usePagedResourceList<SystemUser>({ query: querySystemUsers });
  const [modal, setModal] = useState<ModalState>(null);
  const { run: deleteUser, busyId: deletingUserId } = useResourceAction<SystemUser>(
    (user) => deleteSystemUser(user.id),
    users.loadItems,
  );

  useAdminResourceHeader({
    createLabel: "Create User",
    refreshLabel: "Refresh users",
    loading: users.loading,
    onCreate: () => setModal({ mode: "create" }),
    onRefresh: users.loadItems,
  });

  const { saving, submit } = useResourceSubmit({
    onSuccess: async () => {
      setModal(null);
      await users.loadItems();
    },
  });

  const summary = useMemo(
    () => users.items.reduce(
      (acc, user) => ({
        admin: acc.admin + (user.role === SYSTEM_USER_ROLE.ADMIN ? 1 : 0),
        user: acc.user + (user.role === SYSTEM_USER_ROLE.USER ? 1 : 0),
      }),
      { admin: 0, user: 0 },
    ),
    [users.items],
  );

  const columns: ResourceColumn<SystemUser>[] = [
    {
      key: "user", header: "User", width: "minmax(220px, 300px)",
      render: (user) => (
        <ResourceIdentity icon={user.username.slice(0, 1).toUpperCase()} title={user.username} detail={user.email || "-"} />
      ),
    },
    {
      key: "role", header: "Role", width: "190px",
      render: (user) => <Tag color={SYSTEM_USER_ROLE_COLOR[user.role]}>{SYSTEM_USER_ROLE_LABEL[user.role]}</Tag>,
    },
    { key: "created", header: "Created", width: "minmax(150px, 1fr)", render: (u) => formatDateTime(u.created_at) },
    { key: "updated", header: "Updated", width: "minmax(150px, 1fr)", render: (u) => formatDateTime(u.updated_at) },
    {
      key: "actions", header: "Actions", width: "104px",
      render: (user) => (
        <RowActions>
          <Button icon={<Pencil size={15} />} theme="borderless" type="tertiary" aria-label={`Edit ${user.username}`}
            onClick={() => setModal({ mode: "edit", user })}
          />
          <Popconfirm title="Delete user" content={`Delete ${user.username}?`} okType="danger" cancelText={UI_TEXT.cancel} onConfirm={() => void deleteUser(user)}>
            <Button icon={<Trash2 size={15} />} theme="borderless" type="danger"
              loading={deletingUserId === user.id} aria-label={`Delete ${user.username}`}
            />
          </Popconfirm>
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PagedResourceTable
        ariaLabel="System users"
        columns={columns}
        rows={users.items}
        rowKey={(user) => user.id}
        searchPlaceholder="Search username or email"
        state={users}
        metrics={[
          { label: "Total", value: users.total },
          { label: "Admins", value: summary.admin },
          { label: "Users", value: summary.user },
        ]}
        emptyIcon={<Users size={42} />}
        emptyTitle="No users found"
      />

      {modal?.mode === "edit" ? (
        <UserFormModal
          open mode="edit" user={modal.user} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: UpdateSystemUserRequest) => submit(() => updateSystemUser(modal.user.id, payload))}
        />
      ) : (
        <UserFormModal
          open={modal?.mode === "create"} mode="create" user={null} saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={(payload: CreateSystemUserRequest) => submit(() => createSystemUser(payload))}
        />
      )}
    </>
  );
}
