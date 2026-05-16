import { useCallback, useEffect, useState } from 'react';
import { listPages } from '../lib/db';
import type { Page, PageType } from '../lib/types';

interface Opts {
  type?: PageType | PageType[];
  parent_id?: string | null;
}

export function usePages(opts: Opts) {
  const key = JSON.stringify(opts);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listPages(opts)
      .then((rows) => {
        if (cancelled) return;
        setPages(rows);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  return { pages, loading, error, reload };
}
