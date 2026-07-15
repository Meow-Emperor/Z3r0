import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { showApiError } from "../api/feedback";
import { mergeByKey } from "../lib/array";

const OPTION_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const LOAD_MORE_THRESHOLD_PX = 32;

type QueryResponse<Item> = {
  data?: {
    items: Item[];
    total: number;
  } | null;
};

type QueryOptions<Item> = {
  enabled?: boolean;
  query: (params: { page: number; size: number; keyword: string }) => Promise<QueryResponse<Item>>;
};

export type OptionListResult<Item> = {
  items: Item[];
  knownItems: Item[];
  busy: boolean;
  search: (keyword: string) => void;
  onListScroll: (event: UIEvent<HTMLDivElement>) => void;
  updateItems: (update: (items: Item[]) => Item[]) => void;
};

export function useOptionList<Item extends { id: string | number }>({ enabled = true, query }: QueryOptions<Item>): OptionListResult<Item> {
  const [items, setItems] = useState<Item[]>([]);
  const [knownItems, setKnownItems] = useState<Item[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const keywordRef = useRef("");
  const loadingMoreRef = useRef(false);
  const searchTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (searchTimerRef.current !== undefined) window.clearTimeout(searchTimerRef.current);
    };
  }, []);

  const loadPage = useCallback(async (nextPage: number, keyword: string, append: boolean) => {
    if (!mountedRef.current) return;
    if (append && loadingMoreRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoading(true);
    }
    try {
      const response = await query({ page: nextPage, size: OPTION_PAGE_SIZE, keyword });
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      const data = response.data;
      const nextItems = data?.items ?? [];
      setItems((current) => append ? mergeByKey(current, nextItems, (item) => item.id) : nextItems);
      setKnownItems((current) => mergeByKey(current, nextItems, (item) => item.id));
      setPage(nextPage);
      setTotal(data?.total ?? 0);
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) showApiError(error);
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [query]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMoreRef.current || items.length >= total) return;
    void loadPage(page + 1, keywordRef.current, true);
  }, [enabled, items.length, loadPage, loading, page, total]);

  const search = useCallback((keyword: string) => {
    if (!enabled) return;
    keywordRef.current = keyword.trim();
    requestIdRef.current += 1;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if (searchTimerRef.current !== undefined) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = undefined;
      void loadPage(1, keywordRef.current, false);
    }, SEARCH_DEBOUNCE_MS);
  }, [enabled, loadPage]);

  const onListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= LOAD_MORE_THRESHOLD_PX) {
      loadMore();
    }
  }, [loadMore]);

  const updateItems = useCallback((update: (current: Item[]) => Item[]) => {
    setItems(update);
    setKnownItems(update);
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    if (searchTimerRef.current !== undefined) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = undefined;
    }
    keywordRef.current = "";
    loadingMoreRef.current = false;
    setItems([]);
    setKnownItems([]);
    setPage(0);
    setTotal(0);
    setLoadingMore(false);
    if (!enabled) {
      setLoading(false);
      return;
    }
    void loadPage(1, "", false);
  }, [enabled, loadPage]);

  return useMemo(() => ({
    items,
    knownItems,
    busy: loading || loadingMore,
    search,
    onListScroll,
    updateItems,
  }), [items, knownItems, loading, loadingMore, onListScroll, search, updateItems]);
}
