import { useCallback, useEffect, useRef, useState } from "react";
import { showApiError, showApiSuccess } from "../api/feedback";
import type { CommonResponsePayload } from "../api/types";

type ResourceSubmitOptions<Response extends CommonResponsePayload> = {
  onSuccess?: (response: Response) => unknown | Promise<unknown>;
};

export function useResourceSubmit<Response extends CommonResponsePayload = CommonResponsePayload>(
  { onSuccess }: ResourceSubmitOptions<Response> = {},
) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = useCallback(
    async (action: () => Promise<Response>) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const response = await action();
        if (!mountedRef.current) return;
        showApiSuccess(response);
        await onSuccess?.(response);
      } catch (error) {
        if (mountedRef.current) showApiError(error);
      } finally {
        savingRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    },
    [onSuccess],
  );

  return { saving, submit };
}
