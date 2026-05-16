import { useEffect, useState } from 'react';
import { listBacklinks } from '../lib/db';
import type { Page } from '../lib/types';

export function useBacklinks(targetId: string | undefined) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetId) {
      setPages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listBacklinks(targetId)
      .then((rows) => {
        if (cancelled) return;
        setPages(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPages([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  return { pages, loading };
}
