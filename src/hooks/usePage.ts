import { useCallback, useEffect, useState } from 'react';
import { getPage, updatePage } from '../lib/db';
import type { Page } from '../lib/types';
import { supabase } from '../lib/supabase';

export function usePage(id: string | undefined) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setPage(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPage(id)
      .then((p) => {
        if (cancelled) return;
        setPage(p);
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
  }, [id]);

  // Realtime: refresh when this row changes elsewhere
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`page:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pages', filter: `id=eq.${id}` },
        (payload) => {
          setPage((cur) =>
            cur ? ({ ...cur, ...(payload.new as Partial<Page>) } as Page) : cur,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const save = useCallback(
    async (patch: Partial<Page>) => {
      if (!id) return;
      // optimistic local update
      setPage((cur) => (cur ? ({ ...cur, ...patch } as Page) : cur));
      await updatePage(id, patch as any);
    },
    [id],
  );

  return { page, loading, error, save, setPage };
}
