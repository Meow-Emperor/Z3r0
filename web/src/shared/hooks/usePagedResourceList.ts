import { useCallback, useEffect, useRef, useState } from "react";
import { showApiError } from "../api/feedback";
import { RESOURCE_PAGE_SIZE } from "../api/generated/constants";

type QueryParams = {
  page: number;
  size: number;
  keyword: string;
};

type QueryData<Item> = {
  items: Item[];
  total: number;
};

type QueryResponse<Item, Data extends QueryData<Item>> = {
  data?: Data | null;
};

type UsePagedResourceListOptions<Item, Data extends QueryData<Item>> = {
  query: (params: QueryParams) => Promise<QueryResponse<Item, Data>>;
  onData?: (data: Data | null) => void;
};

export function usePagedResourceList<Item, Data extends QueryData<Item> = QueryData<Item>>({
  query,
  onData,
}: UsePagedResourceListOptions<Item, Data>) {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [activeKeyword, setActiveKeyword] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const loadItems = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await query({ page, size: RESOURCE_PAGE_SIZE, keyword: activeKeyword });
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      const nextItems = response.data?.items || [];
      setTotal(response.data?.total ?? 0);
      onData?.(response.data ?? null);
      if (nextItems.length === 0 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
        return;
      }
      setItems(nextItems);
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        showApiError(error);
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [activeKeyword, onData, page, query]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const search = useCallback(() => {
    setPage(1);
    setActiveKeyword(keyword.trim());
  }, [keyword]);

  const previous = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const next = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  const goToFirstPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    items,
    page,
    keyword,
    total,
    rangeStart: total === 0 ? 0 : (page - 1) * RESOURCE_PAGE_SIZE + 1,
    rangeEnd: Math.min(page * RESOURCE_PAGE_SIZE, total),
    loading,
    loadItems,
    setKeyword,
    search,
    previous,
    next,
    goToFirstPage,
    canGoBack: page > 1,
    canGoNext: page * RESOURCE_PAGE_SIZE < total,
  };
}
