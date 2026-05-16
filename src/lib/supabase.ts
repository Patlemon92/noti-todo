import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[noti-todo] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'copy .env.example to .env.local and fill values.',
  );
}

export const supabase = createClient(url ?? 'http://invalid', anonKey ?? 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export type { Session };
