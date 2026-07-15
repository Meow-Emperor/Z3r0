import { Button } from "@douyinfe/semi-ui";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useAdminHeaderActions } from "../../app/layouts/AdminLayout";

type AdminResourceHeaderOptions = {
  createLabel?: string;
  refreshLabel: string;
  loading: boolean;
  onCreate?: () => void;
  onRefresh: () => unknown | Promise<unknown>;
  createIcon?: ReactNode;
  extraActions?: ReactNode;
};

export function useAdminResourceHeader({
  createLabel,
  refreshLabel,
  loading,
  onCreate,
  onRefresh,
  createIcon,
  extraActions,
}: AdminResourceHeaderOptions) {
  const setHeaderActions = useAdminHeaderActions();
  const onCreateRef = useRef(onCreate);
  const onRefreshRef = useRef(onRefresh);
  onCreateRef.current = onCreate;
  onRefreshRef.current = onRefresh;

  const create = useCallback(() => {
    onCreateRef.current?.();
  }, []);
  const refresh = useCallback(() => {
    void onRefreshRef.current();
  }, []);
  const hasCreate = Boolean(onCreate);

  useEffect(() => {
    const refreshButton = (
      <Button icon={<RefreshCw size={16} />} type="tertiary" onClick={refresh} loading={loading} aria-label={refreshLabel} />
    );
    const createButton = createLabel && hasCreate ? (
      <Button icon={createIcon ?? <Plus size={16} />} theme="solid" type="primary" onClick={create}>
        {createLabel}
      </Button>
    ) : null;

    setHeaderActions(
      <>
        {refreshButton}
        {createButton}
        {extraActions}
      </>,
    );
    return () => setHeaderActions(null);
  }, [
    createIcon,
    createLabel,
    extraActions,
    hasCreate,
    loading,
    create,
    refresh,
    refreshLabel,
    setHeaderActions,
  ]);
}
