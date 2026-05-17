import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

interface Options {
  /** Fires on any insert/update/delete in `pages` for the current user. */
  onPages?: () => void;
  /**
   * Fires on any change to `page_actions`. Note: page_actions has no
   * owner_id column — RLS on the table filters via the parent page, and
   * Supabase realtime respects RLS by default so you only receive rows
   * you'd be allowed to SELECT.
   */
  onActions?: () => void;
}

/**
 * Subscribes to realtime changes on the user's pages + page_actions, so
 * views that show lists (focus / boards / notes / done / trash) can refresh
 * when changes happen elsewhere (other tab, another device, edge function).
 *
 * Stable behavior: only re-creates the channel when the user changes; the
 * callbacks are passed via refs so they can change every render without
 * tearing down the subscription.
 */
export function useRealtimeUserData({ onPages, onActions }: Options) {
  const { user } = useAuth();
  const onPagesRef = useRef(onPages);
  const onActionsRef = useRef(onActions);
  useEffect(() => {
    onPagesRef.current = onPages;
  }, [onPages]);
  useEffect(() => {
    onActionsRef.current = onActions;
  }, [onActions]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-data:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pages',
          filter: `owner_id=eq.${user.id}`,
        },
        () => onPagesRef.current?.(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_actions' },
        () => onActionsRef.current?.(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
