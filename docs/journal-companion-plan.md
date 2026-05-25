# Journal companion — pivot stage 1 MVP plan

The smallest thing Patrick can actually use to test the snap-and-extract model. Targets ~10–15 hours of focused build, spread across 3–4 evenings.

## What "done" looks like

Patrick can:
1. Open the app, see *today* / *notes* / *you* in the nav. Focus + boards are gone.
2. Tap *snap* from anywhere, take or pick a photo of a journal page.
3. See a confirm-and-edit screen showing what Claude extracted: dated items, un-dated to-dos, notes — each with a confidence flag.
4. Tap to edit / skip / approve each, then save.
5. Saved dated items appear under *today* and fire a push notification when due (re-using existing infra).
6. Saved un-dated items appear in *today*'s "loose ends" section.
7. Saved notes appear in *notes*.
8. If he disappears for a week, snapping the week's pages in one session catches everything up. No nag, no "you missed 7 days" framing.

What's deliberately **out of MVP scope** (deferred to pivot stages 2/3):
- Bulk-approve UX polish
- Tap-to-zoom on photo for fixing items
- Vocabulary learning (proper nouns the AI mis-reads)
- Multi-photo snap sessions (start with one photo per session; bulk catches up by repeated snaps)
- Snap history browsing
- Visual traveler's-notebook redesign
- Voice capture

---

## Architecture map

**Existing infra we reuse (do not rebuild):**
- `pages` table + RLS — extracted items become rows here
- `page_actions` table + `push-reminders` pg_cron edge function — extracted dated items get a reminder action, push fires automatically
- Supabase Storage — journal photos live here
- VAPID push subscription system + service worker — already on every installed PWA
- Notes UI (Tiptap + canvas) — extracted notes go into existing note pages

**New surface area in stage 1:**
- `/today` route + view
- `/snap` route (or modal flow)
- `journal_snaps` table
- `extract-journal-snap` edge function
- Confirm/edit screen
- Date sanity helpers in `src/lib/dateSanity.ts`
- BottomNav update: 3 tabs

---

## Phase breakdown

### Phase 1 — Strip the nav (≈1 h)

**Goal:** front door changes shape. Old views remain reachable only by URL.

- `src/components/ui/BottomNav.tsx`: cut `focus` and `boards` items. New items: `today` / `notes` / `you`. Add a centered `+ snap` action (or floating action button) — see Phase 4 for behavior.
- `src/components/ui/Sidebar.tsx` (desktop nav): mirror the same trim.
- Route changes in `src/main.tsx` (or wherever the router is): add `/today` route. Leave `/focus`, `/boards`, `/page/:id`, `/profile` reachable.
- `/today` initially renders a stub: `<EmptyState>nothing here yet. snap a page to add things.</EmptyState>` + a big *snap* CTA.

**Commit:** `pivot: strip nav to today/notes/you, leave old routes reachable by URL`

### Phase 2 — Schema (≈30 min)

**New table.** Migration `00X_journal_snaps.sql`:

```sql
create table journal_snaps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  photo_storage_path text not null,
  processed_at timestamptz,
  raw_extraction jsonb,
  created_at timestamptz not null default now()
);

alter table journal_snaps enable row level security;

create policy "owner reads own snaps" on journal_snaps
  for select using (auth.uid() = owner_id);
create policy "owner inserts own snaps" on journal_snaps
  for insert with check (auth.uid() = owner_id);
create policy "owner updates own snaps" on journal_snaps
  for update using (auth.uid() = owner_id);
create policy "owner deletes own snaps" on journal_snaps
  for delete using (auth.uid() = owner_id);

create index journal_snaps_owner_created_idx on journal_snaps (owner_id, created_at desc);
```

**Hidden parent board for extracted items.** On user signup (or first snap), upsert a `pages` row with `type='board'`, `title='from journal'`, `properties.hidden=true`. Extracted items get `parent_id` set to this row. Boards view hidden means user never sees it as a board anyway, but the parent provides a clean foreign key + future "where did this come from" linkage.

**Storage bucket.** Confirm a `journal-snaps` bucket exists in Supabase Storage with RLS: users can write/read paths starting with `<their uid>/`.

**Commit:** `pivot: journal_snaps table + storage bucket`

### Phase 3 — Date sanity helper (≈1 h)

**New file:** `src/lib/dateSanity.ts` (also imported by edge function — keep it dependency-free).

```ts
// All times in user timezone (default Australia/Sydney from profiles.timezone).

// "Monday 23rd May 2026" — if 23rd May 2026 isn't a Monday, find the nearest Monday in May.
// Returns { date: ISO, flag: 'day-mismatch' | null, suggestions?: ISO[] }
export function resolveDayDateMismatch(input: { day?: string; date?: number; month?: string; year?: number }, ref: Date, tz: string): ...

// Past-date check.
export function flagIfPast(dueAt: string, now: Date): boolean

// "1pm" → if 1pm hasn't passed today, today; else tomorrow.
export function normalizeTime(timeStr: string, photoDate: Date, tz: string): string

// Duplicate detection (cross-snap, within 7 days).
export function findRecentDuplicate(title: string, existing: Array<{ title: string; created_at: string }>, withinDays = 7): existing[number] | null
```

Unit tests in `src/lib/__tests__/dateSanity.test.ts` — Patrick's specific case ("Monday 23rd May 2026") must resolve to 2026-05-25 with a `day-mismatch` flag.

**Commit:** `pivot: date sanity helpers (day-of-week, past, time, dup)`

### Phase 4 — Snap screen (≈1.5 h)

**Route:** `/snap` (or a sheet over `/today`).

**Flow:**
1. Open camera (re-use the existing photo capture from `src/views/PageView.tsx` actions — that already handles iOS/Android picker correctly per the `photos: drop capture=environment` commit).
2. Show preview. *retake* / *use this* buttons.
3. *use this* → upload to Storage at `journal-snaps/<uid>/<snap_id>.jpg`. Insert `journal_snaps` row.
4. Call `extract-journal-snap` edge function with the snap_id.
5. While extracting, show a small *reading your page…* state with the photo visible. Aim < 6s perceived wait.
6. On response, navigate to confirm screen with the extraction.

**Edge cases:**
- Photo rotation: client-side normalize via canvas before upload (don't trust EXIF survival).
- Photo too large: re-encode to JPEG quality 75, max 1600px on longest edge before upload.
- Extraction fails: show retry + "type it myself" fallback that opens a quick-add form.

**Commit:** `pivot: snap screen — capture, upload, kick off extraction`

### Phase 5 — Edge function: extract-journal-snap (≈2.5 h)

**File:** `supabase/functions/extract-journal-snap/index.ts`.

Follow the pattern of existing AI edge functions (`ai-task-capture`, etc.):
- Verify JWT.
- Look up `journal_snaps` row by id; check `owner_id` matches caller.
- Generate a signed URL for the photo from Storage (1 hour TTL).
- Call Anthropic Messages API with vision (model: latest Claude Haiku with vision OR Sonnet if Haiku accuracy on handwriting is poor — to be validated with one test call before settling).
- Parse JSON response (with retry on parse failure).
- Run date sanity layer (port `src/lib/dateSanity.ts` logic to Deno).
- Save processed extraction back to `journal_snaps.raw_extraction`, set `processed_at`.
- Log to `ai_calls` table per existing pattern.
- Return extraction to client.

**System prompt sketch** (refine through testing):

```
you read a photographed page from a paper traveler's notebook and extract items.

the writer is patrick. lowercase, minimal punctuation, mixed cursive + print, sometimes messy.

extract three categories:
1. dated items — anything with a date, day name, or specific time (becomes a reminder)
2. un-dated to-dos — action-shaped items without a date (becomes a loose task)
3. notes — informational content, figures, references, prose without an action

output strict json. do not invent items not visible on the page. if you can't read something, set confidence low rather than guessing wildly.

tone rules for any text you generate (titles, etc):
- lowercase except proper nouns
- brief, no preamble
- no "great task!" filler

schema:
{
  "items": [
    {
      "title": "string (verbatim or lightly cleaned from page)",
      "category": "reminder" | "task" | "note",
      "due_at": "iso 8601 in user tz, or null",
      "raw_date_text": "string from the page if any",
      "confidence": 0.0-1.0,
      "raw_text": "the literal text you read",
      "flags": []
    }
  ],
  "notes_blocks": [
    { "text": "string", "confidence": 0.0-1.0 }
  ]
}

confidence guide:
- 0.9+: clear print, unambiguous, no proper noun guesswork
- 0.6–0.9: readable cursive, some uncertainty on a word
- < 0.6: significant guesswork — flag for user
```

**Validation step before merging:** run the function against the test photo (`/Users/patricklemon/Downloads/IMG_1592.HEIC`) and verify extraction matches the chat session's manual extraction. If Haiku accuracy is poor, switch to Sonnet — cost is still cheap per snap (< $0.05) and Patrick won't snap more than a few times a day.

**Commit:** `pivot: extract-journal-snap edge function`

### Phase 6 — Confirm-and-edit screen (≈2.5 h)

**Route:** `/snap/:snap_id/confirm`.

**Layout:**
- Top: the photo, scaled to fit. Tap to zoom (basic v1: just an enlarged modal; deeper tap-to-line zoom is stage 2).
- Below: list of extracted items, each as a card.
- Each card:
  - title (editable inline)
  - date row (editable, with day-of-week sanity warning visible if `day-mismatch` flag present — show suggested correction)
  - category pill (*reminder* / *task* / *note*) — tappable to switch
  - low-confidence items get a subtle butter-coloured flag
  - swipe-or-tap to skip
- Bottom: notes blocks section — collapsed by default; expand to edit; toggle "save as note" per block.
- Sticky footer: *save all* (primary) + *cancel*.

**Save flow:**
- For each item with category `reminder` or `task`: insert a `pages` row (type='task', parent_id = hidden 'from journal' board, properties.due_at set if reminder).
- For `reminder` items: also insert a `page_actions` row (type='reminder', payload `{ fire_at: due_at }`) so the existing pg_cron picks it up.
- For `note` items + each saved notes block: insert a `pages` row (type='note').
- Mark `journal_snaps.processed_at` (already set by edge function — no-op here unless we want a separate "saved_at").
- Navigate to `/today`.

**Failure modes:** if save fails partway, surface a clear error and keep the confirm screen mounted (don't lose work).

**Commit:** `pivot: confirm-and-edit screen for journal extraction`

### Phase 7 — Today view (≈1.5 h)

**Route:** `/today`. Replaces the front-door role of `/focus`.

**Sections (in order):**
1. Date strip — small, VT323, e.g. `MON 25 MAY`.
2. *Today's pokes* — pages where `type='task'` and `properties.due_at::date = today` and `parent_id = 'from journal' board`. Show as cards with title + due time. Tap a card → mark done / dismiss / edit.
3. *Loose ends* — pages where `type='task'` and `properties.due_at is null` and `parent_id = 'from journal' board`. Compact list. Tap to mark done.
4. Empty state when both sections empty: *"nothing poking. snap a page when you've got something."* + the snap CTA.
5. Floating snap button — bottom right, coral, hard-shadow, glyph `✦` or `+`.

**No "wins" feed in MVP** — keep simple. May re-introduce in stage 2 if Patrick misses it. The point of the today view is: *what's poking + how to add more*.

**Commit:** `pivot: today view`

### Phase 8 — Push wiring smoke test (≈30 min)

Verify the existing `push-reminders` pg_cron picks up the new reminders correctly.

- Create one test reminder via the new flow with `due_at = now() + 2 minutes`.
- Wait. Confirm push fires on Patrick's iPad.
- If anything's off: the gap is usually in `page_actions.payload` shape — match the existing format from `migration 002`.

**No commit needed if it works first time.** If a fix is needed: `pivot: align extracted reminder payload with push-reminders cron`.

---

## Open questions to resolve during build

1. **Model choice for vision.** Haiku 4.5 vs Sonnet. Test with the existing journal photo; pick the cheapest that hits acceptable accuracy. Don't over-engineer fallbacks in v1.
2. **Confidence thresholds.** What's the cutoff for "low confidence" flagging? Start at 0.7; tune from real use.
3. **Notes vs items boundary.** Patrick's friday page was mostly financial figures — clearly a note. His monday page was clearly tasks. Mixed pages will be common. Trust the model's category but make swapping category cheap (one tap).
4. **The "from journal" parent board.** Hide it from boards view via `properties.hidden=true` filter, or via not setting `parent_id` and using a different mechanism? Decide during Phase 2.
5. **Timezone.** Use `profiles.timezone` (already populated, defaults `Australia/Sydney`). All date sanity runs in user tz.

---

## After MVP — what to watch for during personal use

Patrick will use this for a stretch before any stage-2 work. Things to watch:

- How often does the confirm screen feel like a chore? (signal for bulk-approve UX priority)
- Which items get mis-extracted most? (signal for vocabulary learning priority)
- Does he actually snap when he should? (signal that absence-robustness is working — or not)
- Are the push notifications landing and useful? (signal that the dated → push wiring is right)
- Does the today view feel calm or busy? (signal for visual polish direction)

No metrics dashboards. Just attention.
