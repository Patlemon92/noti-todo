# noti-todo — project brief

You are helping Patrick build a personal-first PWA. This file is read first on every session. Follow it closely.

## What this is

A digital companion to a paper traveler's notebook. **Not a replacement.**

Patrick writes all his to-dos and thinking on paper. The app's job is to absorb the things-with-deadlines and notes that he photographs from his notebook, surface them at the right time, and absorb absence gracefully when he disappears for days or weeks.

The product directly counters the failure modes of normal todo apps for ADHD: graveyard lists, shame loops, catch-up debt, data-entry tax.

Patrick Lemon is the founder of Noti (noti.com.au), Sydney. He writes in lowercase with minimal punctuation. Builds Nifty Hub (his job) and helps his wife with Neeve. He has ADHD. He works evenings on this project, with weekend kickoff blocks.

## How we got here (the May 2026 pivot)

The original brief described an "everything is a page" model with focus / boards / task pages / 4 task-specific AI features. A lot of it shipped (see memory `project_state_may_2026`). Patrick used it through and past the 3-day validation gate and surfaced two findings:

- He doesn't use the task / board / focus machinery. All his to-dos go in his paper traveler's notebook.
- The deeper pattern: he used to use Trello, fell off for days/weeks, came back to a catch-up backlog, eventually abandoned it. **Any digital system that builds catch-up debt during absence dies on him.**
- The actual problem: paper is silent. A closed notebook can't tap him on the shoulder. So things he wrote down still get forgotten.

The pivot: drop the task management surface, keep notes, add a snap-and-extract layer. Reuse the already-shipped reminders + Web Push infrastructure to ping him about extracted dated items.

The old code is **hidden, not deleted** — focus / boards / task pages are off the new nav, code retained in the repo.

## The model

- **Paper traveler's notebook = the brain.** Everything still gets written there. Lists, thinking, meeting notes. Unchanged.
- **App = the snap-and-poke layer.** Patrick photographs a journal page; Claude reads it; extracted dated items become reminders that ping him; loose to-dos go in a loose-ends list; mixed prose goes into notes. If he disappears for a week, he snaps the week's pages on return and the app catches up.

### Core loop

1. open app → tap *snap*
2. photograph a journal page (or a backlog of pages)
3. claude extracts: dated items / un-dated to-dos / notes — each with a confidence flag + sanity-checked dates
4. confirm-and-edit screen — bulk-approve the high-confidence items, fix the iffy ones, skip what AI can't parse
5. save: dated → reminders (existing push system pings when due) / un-dated → loose ends / notes → notes section
6. *today* tab shows what's poking today + loose ends

### App shape

- **3 tabs:** today / notes / you
- **Hidden (not deleted):** focus / boards / task pages — code retained, off the nav
- **Notes:** keep current implementation — Tiptap + multi-page canvas + sketches all preserved
- **Profile (you):** trimmed to what matters now (notification times, push subscription mgmt, account)

### The robust-to-absence principle

Every new feature must pass: *"if Patrick disappears for two weeks, what happens?"*

- No streaks. No "you missed your check-in." No XP, no levels.
- No catch-up debt. Returning ≠ processing a backlog of accusations.
- Pokes / reminders that fired and were ignored: silently expire. No accumulating nag.
- The word **overdue** is banned.
- Returning is absorbed, not punished. Snap a backlog → app catches up in minutes.

This principle sits on top of `docs/aliveness-automation.md`'s anti-patterns list. If they conflict, robust-to-absence wins.

## Working preferences

- Plain English over jargon. Honest pushback over agreement.
- One-shot complete files when possible. Preview-first when touching live systems.
- Write code that's deployable, not "here's an idea, fill it in."
- When ambiguous, ask before guessing — but not for every tiny thing.
- Small commits with clear messages. He should be able to read `git log` and understand a session's worth of work.

## Companion planning docs

- `docs/journal-companion-plan.md` — current pivot stage-1 MVP plan. Phase breakdown for snap → extract → confirm → today. **Start here when planning build work.**
- `docs/aliveness-automation.md` — design philosophy + planned automation engine + the "aliveness" framework. Read before planning anything that touches automated behaviors, focus screen language, or system-feel decisions.

## Tech stack

- **Vite + React 18 + TypeScript** — frontend
- **Tailwind CSS** — styling, design tokens in `tailwind.config.ts`
- **Tiptap** — rich text editor (notes; preserved)
- **Supabase** — postgres, auth, storage, realtime, edge functions
- **PWA** — installable on iOS/iPadOS/macOS/Android/Windows via `vite-plugin-pwa`
- **Cloudflare Pages** — hosting at `todo.noti.au`
- **pnpm** — package manager
- **GitHub** — `Patlemon92/noti-todo`
- **Anthropic Claude** — vision-capable model for journal extraction. Existing secret `ANTHROPIC_API_KEY` in Supabase.
- **Web Push (VAPID)** — already shipped + working. Re-used for journal-extracted reminders.

## Design system

Cream + paper aesthetic established. With the pivot, lean *slightly* further into traveler's-notebook character (kraft accents, page-corner furniture, ribbon markers) — Patrick chose "mix of yes-lean and current-fine." Don't go full-redesign; the existing visual language is close.

- **Background**: warm cream (`#f3ebd9`) with subtle dotted grid (light dots at 22px, opacity 0.08).
- **Surfaces**: white/paper cards (`#ffffff` or `#f7f1e1`) with 2px dark outlines (`#2a2520`) and hard offset shadows (`3px 3px 0 var(--ink)` or `4px 4px 0 var(--ink)`). Hard pixel shadows, no blur.
- **Accent**: coral (`#e88562`) used sparingly — active states, focus arrow, primary action highlights.
- **Pastel fills**: peach (`#fde0d4`), butter (`#fbebbc`), mint (`#d9ecdc`), lavender (`#e4dcf2`), sky (`#d9e7ef`).
- **Ink**: `#2a2520` near-black, `#8a8278` soft, `#c4bdb3` faint.

### Typography

- **Fraunces** — headlines, titles. Weights 500–600.
- **VT323** — system chrome: dates, counts, column labels. Uppercase, letterspaced 0.08–0.14em.
- **Bricolage Grotesque** — body text. Weights 400–700.

### Rules

- **No emojis in UI chrome.** Fine in user content; never in labels, buttons, section headers.
- **No icon library for primary UI.** Use typographic glyphs (`+`, `✓`, `▶`, `↻`, `✎`, `★`, `✦`). Lucide only for system icons (settings, share).
- **Buttons feel physical.** Hard offset shadows that compress on `:active`.

### Tone for AI responses

User writes lowercase, hates corporate / coach tone. System prompts must enforce:
- lowercase output (except proper nouns)
- brief, no preamble
- no "Great task!" type filler
- competent-user tone, never patronizing

## Data model

The existing `pages` table is preserved. Journal-extracted items map onto it cleanly without a schema redesign:

- **Extracted dated item** → `pages` row with `type='task'`, `properties.due_at` set, `parent_id` = a hidden "from journal" board, plus a `page_actions` row with `type='reminder'` so the existing push-reminders pg_cron fires it.
- **Un-dated to-do** → same shape, no `due_at`. Surfaces in "loose ends" section of *today*.
- **Notes block** → `pages` row with `type='note'`.
- **Journal snap** → new `journal_snaps` table: `id`, `owner_id`, `photo_storage_path`, `processed_at`, `raw_extraction jsonb`, `created_at`. Confirm-and-edit screen reads from this and creates page rows after user approval.

The pre-pivot tables (`page_links`, `page_actions`, `wins`, `ai_calls`, `profiles`) stay. RLS untouched. The boards / task page UI code remains in the repo; it just isn't reachable from the new nav.

## AI: journal extraction

One new edge function: `extract-journal-snap`.

**Input:** photo storage path.
**Process:**
1. Fetch photo. Auto-orient (fix iPhone EXIF rotation).
2. Send to Claude vision with the extraction system prompt.
3. Parse model output (structured JSON).
4. Run **date sanity layer** post-process:
   - day-of-week vs date consistency (Patrick's example: "Monday 23rd May" → resolve to the nearest matching day, flag for confirm)
   - past-date flagging (don't auto-add reminders for past dates; surface for user)
   - time normalisation ("1pm" → today 1pm if future, else tomorrow)
   - cross-snap duplicate detection (same title within 7 days)
5. Save raw extraction to `journal_snaps.raw_extraction`.
6. Return processed extraction to client for the confirm/edit screen.

**Output schema:**
```json
{
  "items": [
    {
      "title": "...",
      "category": "reminder|task|note",
      "due_at": "ISO timestamp or null",
      "confidence": 0.0,
      "raw_text": "...",
      "flags": ["day-mismatch", "past-date", "duplicate"]
    }
  ],
  "notes_blocks": [
    { "text": "...", "confidence": 0.0 }
  ]
}
```

**System prompt** must enforce the tone rules and never invent items not visible on the page. Low confidence is better than hallucination.

The old 4 AI features (`ai-task-capture`, `ai-pull-from-page`, `ai-break-down`, `ai-stuck`, `ai-ask`) are out of pivot scope — they presupposed task pages. Leave deployed; the new flow doesn't call them. Reassess in pivot stage 3.

## Pivot stages

### Pivot stage 1 (current — MVP)
- Strip nav to 3 tabs (today / notes / you). Hide focus + boards + task page routes from UI.
- New `/today` route — replaces `/focus` as the front door.
- `journal_snaps` table + migration.
- Snap screen — capture or upload photo, upload to Supabase Storage.
- `extract-journal-snap` edge function (Claude vision + date sanity layer).
- Confirm-and-edit screen.
- Save flow: items → task pages, dated ones get reminder `page_actions`. Notes blocks → note pages.
- Date sanity helper utility (used by edge function + client).
- Wire push: existing push-reminders pg_cron picks up new reminder `page_actions` automatically.

### Pivot stage 2
- Confirm screen UX polish: bulk approve, tap-to-zoom on photo, low-confidence flagging, skip-and-type-myself.
- Vocabulary learning: confirmed proper nouns stored per-user, fed back into extraction system prompt.
- Multi-photo snap session (catch up on a week of pages in one go).
- Snap history / browse past snaps.

### Pivot stage 3
- Visual lean-in to traveler's-notebook design (kraft texture, page-corner furniture, ribbon markers).
- Aliveness niceties (time-of-day language softening, optional gentle daily nudge — only if Patrick actually wants one after using stages 1 + 2).
- Photo polish: rotation handled in capture step, multi-page detection on single photo.
- Voice-capture for in-the-moment additions when journal isn't to hand (TBD if needed).

## Validation gate

The original brief required 3 days of daily personal use before stage 3. Patrick did the validation. The gate did its job: it triggered this pivot. **Don't re-litigate it.** Future sessions: trust that the pivot was earned through real use.

## What to do when starting a new session

1. Read this file, `git log --oneline -20`, and (if planning build work) `docs/journal-companion-plan.md`.
2. Skim memory pointers in `MEMORY.md` — particularly `project_pivot_journal_companion_may_2026` and `feedback_robust_to_absence`.
3. Confirm current pivot stage and what's working.
4. Ask Patrick the session goal before changing anything.
5. Match the design system. When in doubt, open `design-reference.html`.
6. Commit early and often with clear messages.
