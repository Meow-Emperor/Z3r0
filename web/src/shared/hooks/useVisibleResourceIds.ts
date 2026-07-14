import { useCallback, useEffect, useState } from "react";

export function useVisibleResourceIds(items: Array<{ id: number }>) {
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    setVisibleIds((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const toggle = useCallback((id: number) => {
    setVisibleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isVisible = useCallback((id: number) => visibleIds.has(id), [visibleIds]);
  return { isVisible, toggle };
}
