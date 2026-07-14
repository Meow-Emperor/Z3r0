import { useCallback, useEffect, useRef, useState } from "react";
import { showApiError, showApiSuccess } from "../api/feedback";
import type { CommonResponsePayload } from "../api/types";

export function useResourceAction<Item extends { id: string | number }>(
  action: (item: Item) => Promise<CommonResponsePayload>,
  onAfter?: () => unknown | Promise<unknown>,
) {
  const [busyId, setBusyId] = useState<Item["id"] | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (item: Item) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyId(item.id);
      try {
        const response = await action(item);
        if (!mountedRef.current) return;
        showApiSuccess(response);
        await onAfter?.();
      } catch (error) {
        if (mountedRef.current) showApiError(error);
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusyId(null);
      }
    },
    [action, onAfter],
  );

  return { run, busyId };
}
