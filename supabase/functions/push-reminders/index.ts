// deno-lint-ignore-file no-explicit-any
//
// Cron-triggered every minute by pg_cron + pg_net (see migration 002).
// - verifies the x-cron-secret header
// - finds reminders whose due_at is in the past and not yet sent
// - looks up the page owner's push subscriptions
// - sends a web push, then stamps payload.sent_at
//
// We auth via the service-role client (bypasses RLS) because the call
// comes from the database, not from a user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ReminderRow {
  id: string;
  page_id: string;
  payload: {
    due_at?: string;
    text?: string;
    sent_at?: string | null;
    dismissed_at?: string | null;
  };
  pages?: { id: string; title: string; owner_id: string };
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ----- auth: pg_cron passes the shared secret -----
  const expected = Deno.env.get('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@noti.com.au';
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'vapid keys missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ----- find due reminders -----
  // We pull a wide candidate set (jsonb filter), then filter in JS.
  // The expression index in migration 002 keeps this snappy.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from('page_actions')
    .select('id, page_id, payload, pages!inner(id,title,owner_id)')
    .eq('type', 'reminder')
    .lte('payload->>due_at', nowIso)
    .limit(200);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const due = ((rows ?? []) as unknown as ReminderRow[]).filter((r) => {
    const p = r.payload ?? {};
    return p.due_at && !p.sent_at && !p.dismissed_at;
  });

  const sent: string[] = [];
  const failures: Array<{ id: string; reason: string }> = [];
  const subResults: Array<{
    reminder_id: string;
    endpoint: string;
    ok: boolean;
    status?: number;
    error?: string;
  }> = [];

  for (const r of due) {
    const page = Array.isArray(r.pages) ? r.pages[0] : r.pages;
    if (!page) continue;

    // load all subscriptions for this user
    const { data: subRows } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', page.owner_id);
    const subs = (subRows ?? []) as Subscription[];

    const payload = JSON.stringify({
      title: page.title || 'reminder',
      body: r.payload.text || 'tap to open',
      page_id: page.id,
      action_id: r.id,
      tag: r.id,
    });

    let pushedAny = false;
    for (const s of subs) {
      const shortEndpoint = s.endpoint.slice(-12);
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        pushedAny = true;
        subResults.push({ reminder_id: r.id, endpoint: shortEndpoint, ok: true });
      } catch (err: any) {
        const code: number | undefined = err?.statusCode ?? err?.status;
        const reason = err?.message || String(err);
        subResults.push({
          reminder_id: r.id,
          endpoint: shortEndpoint,
          ok: false,
          status: code,
          error: reason.slice(0, 200),
        });
        // 404/410 → subscription is dead, prune it
        if (code === 404 || code === 410) {
          await admin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', s.endpoint);
        }
      }
    }

    // mark sent_at regardless — we don't want to re-send forever if a user
    // has no live subs. reminders fall out of the queue after one attempt.
    const nextPayload = {
      ...(r.payload ?? {}),
      sent_at: new Date().toISOString(),
    };
    await admin.from('page_actions').update({ payload: nextPayload }).eq('id', r.id);

    if (pushedAny) sent.push(r.id);
    else failures.push({ id: r.id, reason: subs.length ? 'all subs rejected' : 'no subs' });
  }

  return new Response(
    JSON.stringify({
      scanned: due.length,
      sent: sent.length,
      failures,
      sub_results: subResults,
    }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  );
});
