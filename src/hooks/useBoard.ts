import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { loadBoard, updateCard, createCard, laneFor, type BoardData, type Card } from '../lib/board';
import { demoBoard, isDemo } from '../lib/demoBoard';

/**
 * The board, live. Changes show on screen at once and are written after;
 * if a write fails the board reloads from the database and says so.
 * Changes from elsewhere (other device, overnight roll, Pocket) arrive over
 * realtime; a burst of them is folded into one reload.
 */
export function useBoard() {
  const { user } = useAuth();
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    if (isDemo()) { setData((d) => d ?? demoBoard()); return; }
    try {
      setData(await loadBoard());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load the board');
    }
  }, []);

  useEffect(() => { if (user || isDemo()) reload(); }, [user?.id, reload]);

  useEffect(() => {
    if (!user) return;
    const soon = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(reload, 250);
    };
    const ch = supabase.channel(`board:${user.id}`);
    for (const table of ['cards', 'projects', 'goals', 'routines']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `owner_id=eq.${user.id}` }, soon);
    }
    ch.subscribe();
    // Back from the background (phone unlocked, app reopened): catch up.
    const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(timer.current);
    };
  }, [user?.id, reload]);

  /** Change a card on screen now, in the database next. */
  const patch = useCallback(async (id: number, fields: Partial<Card>) => {
    setData((d) => d && { ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...fields } : c)) });
    if (isDemo()) return;
    try { await updateCard(id, fields); } catch (e) {
      setError(e instanceof Error ? e.message : 'that change did not save');
      reload();
    }
  }, [reload]);

  /** Add a card: a placeholder shows at once, the real one replaces it. */
  const add = useCallback(async (fields: Partial<Card> & { title: string }) => {
    const temp = -Date.now();
    const draft = {
      id: temp, body: null, kind: 'task', project_id: null, goal_id: null, routine_id: null, tags: [], lane: null,
      position: Date.now() / 1000, due_date: null, due_time: null, status: 'open', done_on: null, urgent: false,
      steps: [], link_url: null, origin: 'app', created_at: new Date().toISOString(), ...fields,
    } as Card;
    // Tasks show in their lane at once, as the database will put them.
    if (fields.lane === undefined && (draft.kind === 'task' || draft.kind === 'reminder')) draft.lane = laneFor(draft.due_date);
    setData((d) => d && { ...d, cards: [...d.cards, draft] });
    if (isDemo()) return draft;
    try {
      const real = await createCard(fields);
      setData((d) => d && { ...d, cards: d.cards.map((c) => (c.id === temp ? real : c)) });
      return real;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'that card did not save');
      setData((d) => d && { ...d, cards: d.cards.filter((c) => c.id !== temp) });
      return null;
    }
  }, []);

  return { data, error, reload, patch, add, setData, clearError: () => setError(null) };
}
