import { useCallback, useEffect, useState } from 'react';
import { listTodaysWins } from '../lib/db';
import type { Win } from '../lib/types';

export function useWins() {
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await listTodaysWins();
      setWins(rows);
    } catch {
      // soft fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { wins, loading, reload };
}
