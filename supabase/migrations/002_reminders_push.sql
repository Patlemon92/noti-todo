-- ============================================================================
-- noti-todo · 002_reminders_push
-- adds: push_subscriptions table, expression index for due reminders,
-- pg_cron + pg_net to fire the push-reminders edge function every minute.
-- reminders themselves reuse page_actions (type='reminder', payload jsonb)
-- per the original brief — see _shared/reminders.ts for the payload shape.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- push subscriptions — one row per device/browser the user installs on
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subs_select_own" on public.push_subscriptions;
create policy "push_subs_select_own" on public.push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push_subs_insert_own" on public.push_subscriptions;
create policy "push_subs_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_subs_delete_own" on public.push_subscriptions;
create policy "push_subs_delete_own" on public.push_subscriptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- expression index on page_actions so the cron job's "what's due?" query
-- can stay sub-millisecond even with lots of reminders
-- ----------------------------------------------------------------------------
create index if not exists page_actions_reminder_due_idx
  on public.page_actions ((payload->>'due_at'))
  where type = 'reminder';

create index if not exists page_actions_reminder_unsent_idx
  on public.page_actions ((payload->>'due_at'))
  where type = 'reminder'
    and payload->>'sent_at' is null
    and payload->>'dismissed_at' is null;

-- ----------------------------------------------------------------------------
-- cron: schedule the push-reminders edge function every minute.
-- requires pg_cron + pg_net + a db-level cron_secret that the function checks.
--
-- the CRON_SECRET must be set on the database side using:
--   alter database postgres set app.cron_secret = '<same-value-as-CRON_SECRET-supabase-secret>';
-- the same value is already stored in supabase secrets as CRON_SECRET so the
-- edge function can verify the incoming header.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- de-duplicate: drop any prior schedule with the same name
do $$
begin
  perform cron.unschedule('push-due-reminders');
exception when others then
  null;
end$$;

select cron.schedule(
  'push-due-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gthaduclbnuketvbllqz.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
