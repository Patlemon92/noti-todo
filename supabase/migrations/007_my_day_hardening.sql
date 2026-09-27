-- 007 · Hardening from review of 006.
-- A chat message may only point at your own card; security-definer functions
-- get the safer search_path; first-run setup is for signed-in people only.

drop policy "own thread" on public.thread;
create policy "own thread" on public.thread for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and (card_id is null or exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()))
);

alter function public.pocket_roll(boolean) set search_path = public, pg_temp;
alter function public.pocket_setup() set search_path = public, pg_temp;
alter function public.routines_after_insert() set search_path = public, pg_temp;

revoke execute on function public.pocket_setup() from public, anon;
grant execute on function public.pocket_setup() to authenticated;
