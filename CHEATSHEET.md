# noti-todo cheat sheet

Things that cost time to find out. Add to it on the way out.

- **Migrations 001–005 are NOT recorded in the remote migration history** (they
  were run by hand). `supabase db push` would try to run them again. Never use
  it. Apply one new file with `supabase db query --linked -f supabase/migrations/NNN.sql </dev/null`
  (the project is linked: `supabase link --project-ref gthaduclbnuketvbllqz`).
- **Dry-run a migration against the real database:** wrap it in `begin; … rollback;`
  and run it with `db query --linked -f`. Only the last statement's rows come
  back, so put the checks in one final `select json_build_object(…)`. A function
  that writes (e.g. `pocket_roll()`) must run as its own statement before that
  select: one statement can't see changes made by a function it calls.
- **Supabase project `todolist` is in Tokyo** (ap-northeast-1), ~120 ms from
  Sydney. Update the screen first and write to the database after, or the board feels slow.
- **todo.noti.au** needs three things, because noti.au has a `*.noti.au/*` Worker
  route (noti-wildcard): the Pages custom domain, a proxied CNAME
  `todo → noti-todo.pages.dev`, and a *no-Worker* route `todo.noti.au/*` (like
  app./customer./demo.). Wrangler's login can add the domain and route, not DNS.
