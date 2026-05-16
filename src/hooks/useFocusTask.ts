import { useCallback, useEffect, useMemo, useState } from 'react';
import { nextFocusCandidates } from '../lib/db';
import type { Page } from '../lib/types';

export function useFocusTask() {
  const [candidates, setCandidates] = useState<Page[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await nextFocusCandidates(12);
      setCandidates(rows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useFocusTask]', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () => candidates.filter((p) => !dismissed.has(p.id)),
    [candidates, dismissed],
  );

  const skip = useCallback((id: string) => {
    setDismissed((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const resetSkipped = useCallback(() => {
    setDismissed(new Set());
  }, []);

  return {
    loading,
    error,
    current: visible[0] ?? null,
    alternatives: visible.slice(1, 4),
    totalCount: candidates.length,
    skippedCount: dismissed.size,
    skip,
    resetSkipped,
    reload,
  };
}
