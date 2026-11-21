import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Page } from '../api';

const withPage = (path: string, page: number) => `${path}${path.includes('?') ? '&' : '?'}page=${page}`;

/**
 * Loads a paged list: the first page on mount or when `path` changes, then one more page per
 * `loadMore`. `reload` starts again from page 1, which also drops items a decision just cleared.
 */
export function usePagedList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = useCallback((n: number) => api<Page<T>>(withPage(path, n)), [path]);

  const reload = useCallback(async () => {
    setError('');
    try {
      const res = await fetchPage(1);
      setItems(res.items);
      setPage(1);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this list.');
    }
  }, [fetchPage]);

  useEffect(() => {
    setItems(null);
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError('');
    try {
      const res = await fetchPage(page + 1);
      // Items can shift between pages after a decision elsewhere, so the same id is never shown twice.
      setItems((current) => {
        const seen = new Set((current ?? []).map((item) => (item as { id?: string }).id));
        return [...(current ?? []), ...res.items.filter((item) => !seen.has((item as { id?: string }).id))];
      });
      setPage(res.page);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, page]);

  return { items, hasMore, loadingMore, loadMore, reload, error, setError };
}
