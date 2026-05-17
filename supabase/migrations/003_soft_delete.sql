-- ============================================================================
-- noti-todo · 003_soft_delete
-- soft delete with 5-day grace, wins-log on delete, daily auto-purge cron.
-- ============================================================================

-- deleted_at column ----------------------------------------------------------
alter table public.pages
  add column if not exists deleted_at timestamptz;

-- trash view query: by deleted_at desc
create index if not exists pages_deleted_at_idx
  on public.pages(owner_id, deleted_at desc)
  where deleted_at is not null;

-- speed up the live-pages queries (exclude both archived and trashed)
create index if not exists pages_owner_active_idx
  on public.pages(owner_id, type)
  where archived = false and deleted_at is null;

-- ----------------------------------------------------------------------------
-- broaden wins.source_type to include 'task_deleted'
-- ----------------------------------------------------------------------------
alter table public.wins drop constraint if exists wins_source_type_check;
alter table public.wins add constraint wins_source_type_check
  check (source_type in (
    'task_completed', 'checklist_item', 'session', 'task_deleted'
  ));

-- ----------------------------------------------------------------------------
-- auto-purge: nightly delete of trash older than 5 days
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('purge-trash');
exception when others then
  null;
end$$;

select cron.schedule(
  'purge-trash',
  '15 3 * * *',  -- 03:15 utc daily
  $$
  delete from public.pages
   where deleted_at is not null
     and deleted_at < (now() - interval '5 days');
  $$
);
