-- ============================================================================
-- noti-todo · 005_journal_snaps
-- pivot stage 1: storage for the journal-companion model.
-- - new table `journal_snaps` records each photographed journal page +
--   the raw AI extraction returned by extract-journal-snap.
-- - extracted items become regular pages (type='task' / 'note') and
--   page_actions (type='reminder'). no new tables for those.
-- - private storage bucket `journal-snaps` with per-user folder RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- journal_snaps — one row per photographed page
-- ----------------------------------------------------------------------------
create table if not exists public.journal_snaps (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  photo_storage_path  text not null,
  processed_at        timestamptz,
  raw_extraction      jsonb,
  error               text,
  created_at          timestamptz not null default now()
);

create index if not exists journal_snaps_owner_created_idx
  on public.journal_snaps (owner_id, created_at desc);

alter table public.journal_snaps enable row level security;

drop policy if exists "journal_snaps_select_own" on public.journal_snaps;
create policy "journal_snaps_select_own" on public.journal_snaps
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "journal_snaps_insert_own" on public.journal_snaps;
create policy "journal_snaps_insert_own" on public.journal_snaps
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "journal_snaps_update_own" on public.journal_snaps;
create policy "journal_snaps_update_own" on public.journal_snaps
  for update to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "journal_snaps_delete_own" on public.journal_snaps;
create policy "journal_snaps_delete_own" on public.journal_snaps
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- storage bucket for the journal photos
-- path convention: <uid>/<snap-uuid>.jpg
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('journal-snaps', 'journal-snaps', false)
on conflict (id) do nothing;

drop policy if exists "journal_snaps_storage_select_own" on storage.objects;
create policy "journal_snaps_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal-snaps'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "journal_snaps_storage_insert_own" on storage.objects;
create policy "journal_snaps_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'journal-snaps'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "journal_snaps_storage_delete_own" on storage.objects;
create policy "journal_snaps_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'journal-snaps'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
