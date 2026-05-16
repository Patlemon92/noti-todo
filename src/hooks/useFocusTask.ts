import { useCallback, useEffect, useMemo, useState } from 'react';
import { nextFocusCandidates } from '../lib/db';
import type { Page } from '../lib/types';

interface State {
  loading: boolean;
  current: Page | null;
  alternatives: Page[];
  dismissed: Set<string>;
}

export function useFocusTask() {
  const [candidates, setCandidates] = useState<Page[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await nextFocusCandidates(12);
      setCandidates(rows);
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

  return {
    loading,
    current: visible[0] ?? null,
    alternatives: visible.slice(1, 4),
    skip,
    reload,
  } satisfies Omit<State, 'dismissed'> & {
    skip: (id: string) => void;
    reload: () => Promise<void>;
  };
}
