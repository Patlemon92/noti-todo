-- ============================================================================
-- noti-todo · 001_initial_schema
-- everything is a page. tasks/notes/boards are flavors of one row.
-- safe to re-run: uses create-if-not-exists patterns where reasonable.
-- ============================================================================

-- extensions ------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  timezone      text not null default 'Australia/Sydney',
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- helper: tiptap json -> plaintext
-- recursively pulls every {"text": "..."} leaf and joins with spaces.
-- marked immutable so it's safe in triggers, generated columns, indexes.
-- ============================================================================
create or replace function public.tiptap_to_plaintext(doc jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    string_agg(t #>> '{}', ' '),
    ''
  )
  from jsonb_path_query(
    coalesce(doc, '{}'::jsonb),
    'strict $.**.text ? (@.type() == "string")'
  ) as t
$$;

-- ============================================================================
-- pages — the universal content row
-- ============================================================================
create table if not exists public.pages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  parent_id     uuid references public.pages(id) on delete cascade,
  type          text not null default 'plain'
                  check (type in ('task','note','board','plain')),
  title         text not null default '',
  body          jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  body_text     text not null default '',
  properties    jsonb not null default '{}'::jsonb,
  sort_order    integer not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- updated_at + body_text maintenance
create or replace function public.pages_before_write()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    NEW.updated_at := now();
  end if;
  -- denormalize plaintext from body whenever body changes (or on insert)
  if TG_OP = 'INSERT' or NEW.body is distinct from OLD.body then
    NEW.body_text := public.tiptap_to_plaintext(NEW.body);
  end if;
  return NEW;
end;
$$;

drop trigger if exists pages_before_write on public.pages;
create trigger pages_before_write
  before insert or update on public.pages
  for each row execute function public.pages_before_write();

-- indexes
create index if not exists pages_owner_type_idx        on public.pages(owner_id, type);
create index if not exists pages_parent_idx            on public.pages(parent_id);
create index if not exists pages_owner_updated_idx     on public.pages(owner_id, updated_at desc) where archived = false;
create index if not exists pages_owner_open_tasks_idx  on public.pages(owner_id, created_at)
  where type = 'task' and archived = false and completed_at is null;
create index if not exists pages_owner_recent_idx      on public.pages(owner_id, updated_at desc)
  where type = 'task' and archived = false and completed_at is null;

-- ============================================================================
-- page_links — internal links between pages (for backlinks)
-- ============================================================================
create table if not exists public.page_links (
  id               uuid primary key default gen_random_uuid(),
  source_page_id   uuid not null references public.pages(id) on delete cascade,
  target_page_id   uuid not null references public.pages(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (source_page_id, target_page_id),
  check (source_page_id <> target_page_id)
);

create index if not exists page_links_target_idx on public.page_links(target_page_id);
create index if not exists page_links_source_idx on public.page_links(source_page_id);

-- refresh page_links from pageMention nodes in body
create or replace function public.refresh_page_links()
returns trigger
language plpgsql
as $$
declare
  v_target_id uuid;
begin
  delete from public.page_links where source_page_id = NEW.id;

  insert into public.page_links (source_page_id, target_page_id)
  select distinct NEW.id, mention_id
  from (
    select (m #>> '{}')::uuid as mention_id
    from jsonb_path_query(
      coalesce(NEW.body, '{}'::jsonb),
      'strict $.** ? (@.type == "pageMention").attrs.id'
    ) as m
    where (m #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) sub
  where mention_id <> NEW.id
  on conflict (source_page_id, target_page_id) do nothing;

  return NEW;
exception when others then
  -- never let link parsing break a write
  return NEW;
end;
$$;

drop trigger if exists pages_refresh_links_ins on public.pages;
create trigger pages_refresh_links_ins
  after insert on public.pages
  for each row execute function public.refresh_page_links();

drop trigger if exists pages_refresh_links_upd on public.pages;
create trigger pages_refresh_links_upd
  after update of body on public.pages
  for each row
  when (NEW.body is distinct from OLD.body)
  execute function public.refresh_page_links();

-- ============================================================================
-- page_actions — timer sessions, reminders, attached links, etc
-- ============================================================================
create table if not exists public.page_actions (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages(id) on delete cascade,
  type        text not null
                check (type in ('timer','reminder','url_link','image','snooze','delegate')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists page_actions_page_idx on public.page_actions(page_id, created_at desc);

-- ============================================================================
-- wins — today-you-did feed
-- ============================================================================
create table if not exists public.wins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  source_type  text not null
                 check (source_type in ('task_completed','checklist_item','session')),
  source_id    uuid not null,
  text         text not null,
  occurred_at  timestamptz not null default now()
);

create index if not exists wins_user_when_idx on public.wins(user_id, occurred_at desc);

-- ============================================================================
-- ai_calls — observability for AI features
-- ============================================================================
create table if not exists public.ai_calls (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  feature        text not null,
  input_tokens   integer,
  output_tokens  integer,
  duration_ms    integer,
  succeeded      boolean not null default true,
  error          text,
  page_id        uuid references public.pages(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists ai_calls_user_when_idx on public.ai_calls(user_id, created_at desc);

-- ============================================================================
-- new user bootstrap: profile + default board + 4 sample tasks
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(coalesce(NEW.email,''), '@', 1))
  )
  on conflict (id) do nothing;

  -- default board
  insert into public.pages (owner_id, type, title, properties, sort_order)
  values (
    NEW.id,
    'board',
    'my board',
    jsonb_build_object(
      'color', 'sky',
      'columns', jsonb_build_array(
        jsonb_build_object('id','today',  'name','today',  'color','peach',    'sort_order',0),
        jsonb_build_object('id','doing',  'name','doing',  'color','butter',   'sort_order',1),
        jsonb_build_object('id','waiting','name','waiting','color','lavender', 'sort_order',2),
        jsonb_build_object('id','done',   'name','done',   'color','mint',     'sort_order',3)
      )
    ),
    0
  )
  returning id into v_board_id;

  -- 4 sample tasks
  insert into public.pages (owner_id, parent_id, type, title, body, properties, sort_order) values
    (
      NEW.id, v_board_id, 'task',
      'welcome — tap any task to open it',
      jsonb_build_object('type','doc','content', jsonb_build_array(
        jsonb_build_object('type','paragraph','content', jsonb_build_array(
          jsonb_build_object('type','text','text',
            'this is your first task page. tap to open. type freely. press / for a slash menu, or @ to link another page.')
        ))
      )),
      jsonb_build_object('status','today','column_id','today'),
      0
    ),
    (
      NEW.id, v_board_id, 'task',
      'try the focus screen — one thing at a time',
      jsonb_build_object('type','doc','content', jsonb_build_array(
        jsonb_build_object('type','paragraph','content', jsonb_build_array(
          jsonb_build_object('type','text','text',
            'the focus screen picks one task and asks: what now? swap it with ↻ not this.')
        ))
      )),
      jsonb_build_object('status','today','column_id','today'),
      1
    ),
    (
      NEW.id, v_board_id, 'task',
      'add a checklist to break a task down',
      jsonb_build_object('type','doc','content', jsonb_build_array(
        jsonb_build_object('type','paragraph','content', jsonb_build_array(
          jsonb_build_object('type','text','text',
            'open this task, then tap ✦ break this down to let ai suggest 3–5 small steps.')
        ))
      )),
      jsonb_build_object(
        'status','doing','column_id','doing',
        'checklist', jsonb_build_array(
          jsonb_build_object('id','c1','text','open this task','done',true,'done_at', to_jsonb(now())),
          jsonb_build_object('id','c2','text','tap break this down','done',false),
          jsonb_build_object('id','c3','text','accept a step or two','done',false)
        )
      ),
      2
    ),
    (
      NEW.id, v_board_id, 'task',
      'send yourself a task by typing in the + sheet',
      jsonb_build_object('type','doc','content', jsonb_build_array(
        jsonb_build_object('type','paragraph','content', jsonb_build_array(
          jsonb_build_object('type','text','text',
            'tap + on the focus screen, dump anything, and ai will parse out the tasks.')
        ))
      )),
      jsonb_build_object('status','waiting','column_id','waiting'),
      3
    );

  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- row level security
-- pattern: owner_id = auth.uid() (subselect form for plan caching).
-- splitting policies per command keeps with check + using cleanly separated.
-- to layer per-board sharing later, swap these with "owner OR member" CTEs.
-- ============================================================================

-- profiles --------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- pages -----------------------------------------------------------------------
alter table public.pages enable row level security;

drop policy if exists "pages_select_own" on public.pages;
create policy "pages_select_own" on public.pages
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "pages_insert_own" on public.pages;
create policy "pages_insert_own" on public.pages
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "pages_update_own" on public.pages;
create policy "pages_update_own" on public.pages
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "pages_delete_own" on public.pages;
create policy "pages_delete_own" on public.pages
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- page_links ------------------------------------------------------------------
alter table public.page_links enable row level security;

drop policy if exists "page_links_select_via_source" on public.page_links;
create policy "page_links_select_via_source" on public.page_links
  for select to authenticated
  using (
    exists (
      select 1 from public.pages p
      where p.id = page_links.source_page_id
        and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.pages p
      where p.id = page_links.target_page_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "page_links_insert_via_source" on public.page_links;
create policy "page_links_insert_via_source" on public.page_links
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pages p
      where p.id = page_links.source_page_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "page_links_delete_via_source" on public.page_links;
create policy "page_links_delete_via_source" on public.page_links
  for delete to authenticated
  using (
    exists (
      select 1 from public.pages p
      where p.id = page_links.source_page_id
        and p.owner_id = (select auth.uid())
    )
  );

-- page_actions ----------------------------------------------------------------
alter table public.page_actions enable row level security;

drop policy if exists "page_actions_select_via_page" on public.page_actions;
create policy "page_actions_select_via_page" on public.page_actions
  for select to authenticated
  using (
    exists (
      select 1 from public.pages p
      where p.id = page_actions.page_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "page_actions_insert_via_page" on public.page_actions;
create policy "page_actions_insert_via_page" on public.page_actions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pages p
      where p.id = page_actions.page_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "page_actions_update_via_page" on public.page_actions;
create policy "page_actions_update_via_page" on public.page_actions
  for update to authenticated
  using (
    exists (
      select 1 from public.pages p
      where p.id = page_actions.page_id
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.pages p
      where p.id = page_actions.page_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "page_actions_delete_via_page" on public.page_actions;
create policy "page_actions_delete_via_page" on public.page_actions
  for delete to authenticated
  using (
    exists (
      select 1 from public.pages p
      where p.id = page_actions.page_id
        and p.owner_id = (select auth.uid())
    )
  );

-- wins ------------------------------------------------------------------------
alter table public.wins enable row level security;

drop policy if exists "wins_select_own" on public.wins;
create policy "wins_select_own" on public.wins
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "wins_insert_own" on public.wins;
create policy "wins_insert_own" on public.wins
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "wins_delete_own" on public.wins;
create policy "wins_delete_own" on public.wins
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ai_calls --------------------------------------------------------------------
alter table public.ai_calls enable row level security;

drop policy if exists "ai_calls_select_own" on public.ai_calls;
create policy "ai_calls_select_own" on public.ai_calls
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- inserts come from edge functions via service_role (bypasses RLS).

-- ============================================================================
-- done
-- ============================================================================
