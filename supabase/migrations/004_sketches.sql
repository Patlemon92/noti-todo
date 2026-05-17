-- ============================================================================
-- noti-todo · 004_sketches
-- adds 'sketch' to the allowed page_actions.type values so handwritten
-- ink notes can be attached to any page. payload shape:
--   { svg: "<svg ...>...</svg>",
--     w: number, h: number,
--     created_at?: iso }
-- ============================================================================

alter table public.page_actions drop constraint if exists page_actions_type_check;
alter table public.page_actions add constraint page_actions_type_check
  check (type in (
    'timer','reminder','url_link','image','snooze','delegate','sketch'
  ));
