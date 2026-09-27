-- 006 · My Day: the board Pocket runs.
--
-- Cards live on a board of time lanes (today · tomorrow · week · coming ·
-- backlog), carry a project label, and look after themselves: a new card
-- lands in the lane its date says, and once a night (Sydney) tomorrow becomes
-- today, dated cards move closer, today's routines appear (yesterday's
-- unticked ones quietly go), and today is topped up to three. Nothing ever
-- piles up: done cards stay ticked until the day ends, then live only in the
-- archive by date.
--
-- Separate from `pages` on purpose: notes and the old journal tasks are
-- untouched. Every row belongs to one person and RLS keeps it that way; the
-- brain (edge functions, the Mac mini) uses the service role.

-- ── helpers ────────────────────────────────────────────────────────────

create or replace function public.sydney_today() returns date
  language sql stable as $$ select (now() at time zone 'Australia/Sydney')::date $$;

-- The lane a date belongs in. No date: this week (the morning top-up pulls from there).
create or replace function public.lane_for(d date) returns text
  language sql stable as $$
  select case
    when d is null then 'week'
    when d <= public.sydney_today() then 'today'
    when d = public.sydney_today() + 1 then 'tomorrow'
    when d <= public.sydney_today() + 6 then 'week'
    else 'coming' end $$;

-- Whether a routine rule falls on a day.
create or replace function public.rule_on(rule text, d date) returns boolean
  language sql immutable as $$
  select case
    when rule = 'daily' then true
    when rule = 'weekdays' then extract(isodow from d) <= 5
    when rule like 'weekly:%' then extract(dow from d)::int = split_part(rule, ':', 2)::int
    when rule like 'monthly:%' then extract(day from d)::int = least(split_part(rule, ':', 2)::int,
      extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int)
    else false end $$;

-- ── tables ─────────────────────────────────────────────────────────────

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z][a-z0-9-]{0,19}$'),   -- what you type: "hub: …"
  name        text not null check (length(name) between 1 and 40),
  color       text not null default '#8a8278' check (color ~ '^#[0-9a-fA-F]{6}$'),
  aliases     text[] not null default '{}',                            -- other words that mean this project
  place       text not null default 'any' check (place in ('work', 'home', 'any')),
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  color       text not null default '#e88562' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort        int not null default 0,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Routines: the checks that come round by themselves (was the Trello
-- "Automatic Tasks" board). Each morning today's appear as cards in Today.
create table public.routines (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  project_id  uuid references public.projects(id) on delete set null,
  tags        text[] not null default '{}',
  rule        text not null check (rule ~ '^(daily|weekdays|weekly:[0-6]|monthly:([1-9]|[12][0-9]|3[01]))$'),
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.cards (
  id              bigint generated always as identity primary key,   -- the #23 you can type
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null check (length(title) between 1 and 300),
  body            text check (length(body) <= 5000),
  kind            text not null default 'task' check (kind in ('task', 'fix', 'idea', 'reminder', 'question', 'info')), -- info: reference, never scheduled
  project_id      uuid references public.projects(id) on delete set null,
  goal_id         uuid references public.goals(id) on delete set null,
  routine_id      uuid references public.routines(id) on delete set null,
  tags            text[] not null default '{}',                       -- labels: accounts, must, urgent, loscam…
  lane            text check (lane in ('today', 'tomorrow', 'week', 'coming', 'backlog')), -- null: in its project only (ideas, fixes)
  position        double precision not null default extract(epoch from now()),
  due_date        date,
  due_time        time,                                               -- Sydney wall time, if it has one
  status          text not null default 'open' check (status in ('open', 'done', 'dropped', 'archived')),
  done_on         date,                                               -- the Sydney day it was ticked: the archive groups by this
  completed_at    timestamptz,
  urgent          boolean not null default false,
  steps           jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  link_url        text check (link_url is null or link_url ~ '^https?://'),
  origin          text not null default 'app' check (origin in ('app', 'chat', 'snap', 'calendar', 'email', 'routine', 'import')),
  external_id     text,                                               -- routine:<id>:<date>, a calendar or email id: nothing arrives twice
  classified_by   text,
  rollover_count  int not null default 0,
  last_shown_on   date,
  asked_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, external_id)
);
create index cards_board on public.cards (owner_id, status, lane, position);
create index cards_project on public.cards (owner_id, project_id, status);
create index cards_done_on on public.cards (owner_id, done_on) where done_on is not null;

-- The chat with Pocket: what you said and what it answered, newest last.
create table public.thread (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at          timestamptz not null default now(),
  who         text not null check (who in ('me', 'pocket')),
  text        text not null check (length(text) between 1 and 4000),
  card_id     bigint references public.cards(id) on delete set null,
  chips       jsonb                                                   -- buttons under a reply: [{label, action}]
);
create index thread_recent on public.thread (owner_id, id desc);

-- One row of settings per person.
create table public.pocket_settings (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  max_today     int not null default 3 check (max_today between 1 and 5),
  last_roll_on  date,
  updated_at    timestamptz not null default now()
);

-- ── rules the board keeps by itself ────────────────────────────────────

create or replace function public.cards_before_write() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    -- Tasks land in the lane their date says; ideas and fixes stay in their project.
    if new.lane is null and new.kind in ('task', 'reminder') then new.lane := public.lane_for(new.due_date); end if;
    if new.lane is not null and new.position = extract(epoch from now()) then
      new.position := coalesce((select max(position) + 1 from public.cards
        where owner_id = new.owner_id and lane = new.lane and status = 'open'), extract(epoch from now()));
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_on := public.sydney_today();
    new.completed_at := now();
    new.asked_at := null;
  elsif new.status = 'open' and tg_op = 'UPDATE' and old.status <> 'open' then
    new.done_on := null;
    new.completed_at := null;
  end if;
  -- Touching a card (moving it, reopening it) resets its "shown and ignored" count.
  if tg_op = 'UPDATE' and (new.lane is distinct from old.lane or new.status <> old.status) then
    new.rollover_count := 0;
    new.asked_at := null;
  end if;
  return new;
end $$;
create trigger cards_before_write before insert or update on public.cards
  for each row execute function public.cards_before_write();

-- A routine made during the day shows up today if today is one of its days.
create or replace function public.routines_after_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.active and public.rule_on(new.rule, public.sydney_today()) then
    insert into public.cards (owner_id, title, kind, project_id, routine_id, tags, lane, due_date, origin, external_id)
    values (new.owner_id, new.title, 'task', new.project_id, new.id, new.tags, 'today', public.sydney_today(), 'routine',
      'routine:' || new.id || ':' || public.sydney_today())
    on conflict (owner_id, external_id) do nothing;
  end if;
  return null;
end $$;
create trigger routines_after_insert after insert on public.routines
  for each row execute function public.routines_after_insert();

-- Once a night per person, after midnight in Sydney. Runs hourly; does nothing
-- after the first run of the day, so a quiet hour writes nothing.
create or replace function public.pocket_roll(force boolean default false) returns int
  language plpgsql security definer set search_path = public as $$
declare s record; today date := public.sydney_today(); have int; rolled int := 0;
begin
  for s in select * from public.pocket_settings loop
    if s.last_roll_on = today and not force then continue; end if;
    -- Yesterday's routines that weren't ticked just go: no pile of old checks after a week away.
    update public.cards set status = 'archived', lane = null
      where owner_id = s.owner_id and status = 'open' and origin = 'routine' and due_date < today;
    -- Today's routines.
    insert into public.cards (owner_id, title, kind, project_id, routine_id, tags, lane, due_date, origin, external_id)
      select r.owner_id, r.title, 'task', r.project_id, r.id, r.tags, 'today', today, 'routine', 'routine:' || r.id || ':' || today
      from public.routines r where r.owner_id = s.owner_id and r.active and public.rule_on(r.rule, today)
      on conflict (owner_id, external_id) do nothing;
    -- Tomorrow is today.
    update public.cards set lane = 'today' where owner_id = s.owner_id and status = 'open' and lane = 'tomorrow';
    -- Dated cards move closer as their day nears, never further away.
    update public.cards c set lane = public.lane_for(c.due_date)
      where c.owner_id = s.owner_id and c.status = 'open' and c.due_date is not null
        and c.lane in ('week', 'coming', 'backlog')
        and array_position(array['today','tomorrow','week','coming','backlog'], public.lane_for(c.due_date))
          < array_position(array['today','tomorrow','week','coming','backlog'], c.lane);
    -- Top today up to three (or whatever max_today is) from this week.
    select count(*) into have from public.cards where owner_id = s.owner_id and status = 'open' and lane = 'today' and origin <> 'routine';
    if have < s.max_today then
      update public.cards set lane = 'today' where id in (
        select id from public.cards where owner_id = s.owner_id and status = 'open' and lane = 'week' and kind in ('task', 'reminder')
        order by due_date nulls last, position limit s.max_today - have);
    end if;
    update public.pocket_settings set last_roll_on = today, updated_at = now() where owner_id = s.owner_id;
    rolled := rolled + 1;
  end loop;
  return rolled;
end $$;

-- First-run setup for the signed-in person: settings and the starting projects.
create or replace function public.pocket_setup() returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.pocket_settings (owner_id) values (auth.uid()) on conflict do nothing;
  insert into public.projects (owner_id, slug, name, color, aliases, place, sort) values
    (auth.uid(), 'nifty',  'Nifty',     '#e88562', '{"nifty foods"}',        'work', 1),
    (auth.uid(), 'hub',    'Nifty Hub', '#a896d4', '{"nifty hub"}',          'work', 2),
    (auth.uid(), 'neeve',  'Neeve',     '#7fb389', '{}',                     'home', 3),
    (auth.uid(), 'noti',   'Noti',      '#d48a8a', '{"consultancy"}',        'home', 4),
    (auth.uid(), 'market', 'Market',    '#8db4c8', '{"marketplace"}',        'home', 5),
    (auth.uid(), 'ops',    'noti-ops',  '#8a8278', '{"noti-ops","admin"}',   'home', 6),
    (auth.uid(), 'life',   'Life',      '#e8c75f', '{"general","home"}',     'any',  7)
  on conflict do nothing;
end $$;
grant execute on function public.pocket_setup() to authenticated;
revoke execute on function public.pocket_roll(boolean) from public, anon, authenticated;

-- ── who can see what ───────────────────────────────────────────────────

alter table public.projects enable row level security;
alter table public.goals enable row level security;
alter table public.routines enable row level security;
alter table public.cards enable row level security;
alter table public.thread enable row level security;
alter table public.pocket_settings enable row level security;

create policy "own projects" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own goals" on public.goals for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own routines" on public.routines for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())));
create policy "own thread" on public.thread for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own settings" on public.pocket_settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- A card may only point at your own project and goal.
create policy "own cards" on public.cards for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  and (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.owner_id = auth.uid()))
  and (routine_id is null or exists (select 1 from public.routines r where r.id = routine_id and r.owner_id = auth.uid()))
);

alter publication supabase_realtime add table public.cards, public.projects, public.goals, public.routines, public.thread;

-- Every hour at :02; the function itself makes it once a day.
select cron.schedule('pocket-roll', '2 * * * *', $$select public.pocket_roll()$$);

-- Everyone who already has an account gets the starting set.
insert into public.pocket_settings (owner_id) select id from auth.users on conflict do nothing;
insert into public.projects (owner_id, slug, name, color, aliases, place, sort)
select u.id, p.slug, p.name, p.color, p.aliases, p.place, p.sort from auth.users u cross join (values
  ('nifty',  'Nifty',     '#e88562', '{"nifty foods"}'::text[],      'work', 1),
  ('hub',    'Nifty Hub', '#a896d4', '{"nifty hub"}'::text[],        'work', 2),
  ('neeve',  'Neeve',     '#7fb389', '{}'::text[],                   'home', 3),
  ('noti',   'Noti',      '#d48a8a', '{"consultancy"}'::text[],      'home', 4),
  ('market', 'Market',    '#8db4c8', '{"marketplace"}'::text[],      'home', 5),
  ('ops',    'noti-ops',  '#8a8278', '{"noti-ops","admin"}'::text[], 'home', 6),
  ('life',   'Life',      '#e8c75f', '{"general","home"}'::text[],   'any',  7)
) as p(slug, name, color, aliases, place, sort)
on conflict do nothing;
