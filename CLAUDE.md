# noti-todo — project brief

You are helping Patrick build a personal-then-public PWA. This file is read first on every session. Follow it closely.

## What this is

An ADHD-friendly attention guidance system, designed around the model that **everything is a page**. Tasks are pages with task properties. Notes are pages without them. Boards are pages that group other pages. The home screen ("focus") answers one question: *what now?* But underneath, every piece of content lives in one unified `pages` table that can be richly edited, linked together, and (later) shared.

The product directly counters the failure modes of normal todo apps: graveyard lists, shame loops, time blindness, data-entry tax, overwhelm.

Patrick Lemon is the founder of Noti (noti.com.au), Sydney. He writes in lowercase with minimal punctuation. Builds Nifty Hub (his job) and helps his wife with Neeve. This app (`noti-todo`) is his side project, intended to be used solo first, then released publicly. He has ADHD. He works evenings on this project, with kickoff blocks on weekends.

## Working preferences

- Plain English over jargon. Honest pushback over agreement.
- One-shot complete files when possible. Preview-first when touching live systems.
- Write code that's deployable, not "here's an idea, fill it in."
- When ambiguous, ask before guessing — but not for every tiny thing.
- Small commits with clear messages. He should be able to read `git log` and understand a session's worth of work.

## Tech stack

- **Vite + React 18 + TypeScript** — frontend
- **Tailwind CSS** — styling, design tokens in `tailwind.config.ts`
- **Tiptap** — rich text editor (page bodies, with floating toolbar + slash menu + page mentions)
- **Supabase** — postgres, auth, storage, realtime, edge functions
- **PWA** — installable on iOS/iPadOS/macOS/Android/Windows via `vite-plugin-pwa`
- **Cloudflare Pages** — hosting at `todo.noti.au` via wrangler (already authenticated)
- **pnpm** — package manager
- **GitHub** — repo, already connected to Cloudflare
- **Anthropic API** — Claude Haiku 4.5 for AI features, key as Supabase secret

## Design system

Mockup at `design-reference.html` shows the agreed visual direction. Match it precisely.

- **Background**: warm cream (`#f3ebd9`) with subtle dotted grid (light dots at 22px, opacity 0.08).
- **Surfaces**: white/paper cards (`#ffffff` or `#f7f1e1`) with 2px dark outlines (`#2a2520`) and hard offset shadows (`3px 3px 0 var(--ink)` or `4px 4px 0 var(--ink)`). Hard pixel shadows, no blur.
- **Accent**: coral (`#e88562`) used sparingly — active states, focus arrow, primary action highlights.
- **Pastel fills**: peach (`#fde0d4`), butter (`#fbebbc`), mint (`#d9ecdc`), lavender (`#e4dcf2`), sky (`#d9e7ef`).
- **Ink**: `#2a2520` near-black, `#8a8278` soft, `#c4bdb3` faint.

### Typography

- **Fraunces** (Google Fonts) — headlines, page titles, hero serif moments. Weights 500–600.
- **VT323** (Google Fonts) — system chrome: dates, counts, column labels, eyebrows. Uppercase, letterspaced 0.08–0.14em.
- **Bricolage Grotesque** (Google Fonts) — body text. Weights 400–700.

### Rules

- **No emojis in UI chrome.** Fine in user content; never in labels, buttons, section headers.
- **No icon library for primary UI.** Use typographic glyphs (`+`, `✓`, `▶`, `↻`, `✎`, `★`, `✦`). Lucide only for system icons (settings, share, etc.).
- **Buttons feel physical.** Hard offset shadows that compress on `:active`.

## Core architecture: everything is a page

A `page` is the fundamental unit. All content lives in the `pages` table. Pages have:
- A title
- A rich text body (Tiptap JSON, stored as jsonb)
- An optional parent page (for nesting — pages live in a tree)
- A type discriminator (`task` | `note` | `board` | `plain`) — a *flavor*, not a separate table
- Type-specific properties stored as jsonb on the page
- Sort order within its parent

```sql
pages
  id uuid pk
  owner_id uuid references profiles(id) on delete cascade
  parent_id uuid null references pages(id) on delete cascade
  type text not null default 'plain'   -- 'task' | 'note' | 'board' | 'plain'
  title text default ''
  body jsonb default '{"type":"doc","content":[]}'::jsonb  -- Tiptap JSON
  properties jsonb default '{}'::jsonb  -- type-specific
  sort_order int default 0
  archived boolean default false
  created_at timestamptz default now()
  updated_at timestamptz default now()
  completed_at timestamptz null
```

### Type-specific properties (in `properties` jsonb)

**`type = 'task'`**:
```ts
{
  status?: 'today' | 'doing' | 'waiting' | 'done',
  board_id?: string,
  column_id?: string,
  snoozed_until?: string,        // ISO timestamp
  checklist?: Array<{ id: string, text: string, done: boolean, done_at?: string }>,
  due_at?: string,
  estimated_minutes?: number
}
```

**`type = 'note'`**: no required properties.

**`type = 'board'`**:
```ts
{
  color?: 'peach'|'butter'|'mint'|'lavender'|'sky'|'rose',
  columns?: Array<{ id: string, name: string, color: string, sort_order: number }>
}
```

**`type = 'plain'`**: future or unclassified.

### Why this shape

- **One editor, one data layer.** Tiptap renders the body of every page identically.
- **Linking works everywhere.** Any page links to any page. Backlinks come for free.
- **Boards are opinionated views over pages.** A board page has child pages of type `task`; the board view groups them. Same data, different lens.
- **Future-proof for collaboration.** Sharing a page (and its descendants) is a clean concept later.
- **Future-proof for views.** Same pages can later become calendar, list, gallery views.

### Supporting tables

```sql
profiles            -- 1:1 with auth.users
  id uuid pk references auth.users
  display_name text
  timezone text default 'Australia/Sydney'
  created_at timestamptz default now()

page_links          -- internal links between pages (for backlinks)
  id uuid pk
  source_page_id uuid references pages(id) on delete cascade
  target_page_id uuid references pages(id) on delete cascade
  created_at timestamptz default now()
  unique (source_page_id, target_page_id)

page_actions        -- timer sessions, reminders, attached urls/images, etc.
  id uuid pk
  page_id uuid references pages(id) on delete cascade
  type text not null  -- 'timer'|'reminder'|'url_link'|'image'|'snooze'|'delegate'
  payload jsonb default '{}'::jsonb
  created_at timestamptz default now()

wins                -- today-you-did feed
  id uuid pk
  user_id uuid references profiles(id) on delete cascade
  source_type text not null  -- 'task_completed'|'checklist_item'|'session'
  source_id uuid not null
  text text not null
  occurred_at timestamptz default now()

ai_calls            -- log of AI invocations
  id uuid pk
  user_id uuid references profiles(id) on delete cascade
  feature text not null
  input_tokens int
  output_tokens int
  duration_ms int
  succeeded boolean default true
  error text null
  page_id uuid null references pages(id) on delete set null
  created_at timestamptz default now()
```

### RLS

All tables filtered by `auth.uid() = owner_id` (or user_id), or via parent joins. Designed to layer a future `memberships` table on top without schema changes — see "future-proofing for collaboration" below.

## Rich text editor (Tiptap)

Every page body is a Tiptap document. Configure with:

**Extensions**:
- StarterKit (paragraphs, headings, lists, bold, italic, code, blockquote)
- Link
- Placeholder
- TaskList + TaskItem (inline checklists)
- Custom: **PageMention** node — `@` or `[[` triggers a popup to search and link other pages
- Custom: **SlashMenu** extension — `/` opens a popup with block options (h1, h2, bullet list, task list, code block, quote, link to page)

**Floating toolbar** appears on text selection: bold, italic, h1, h2, bullet list, link, mention page.

**Markdown shortcuts**: `# ` for h1, `## ` for h2, `- ` for bullet, `[] ` for checklist, `> ` for blockquote.

**Storage**: serialize as Tiptap JSON to `pages.body`. Maintain a denormalized plaintext extract (computed column or trigger) for previews and search.

**Sync**: debounced save 500ms after last keystroke. Optimistic UI. Conflict resolution is last-write-wins for stages 1-3; stage 4 (collab) introduces real-time merge.

## Page linking and backlinks

When a page body saves, parse Tiptap JSON for `PageMention` nodes:
1. Delete all `page_links` where `source_page_id = this page`
2. Insert new rows for every mentioned page

**Backlinks UI**: at the bottom of every page view, "↳ linked from" — a list of pages with `target_page_id = this page`. Pills linking to source.

## App views

### 1. Focus (front door)

Top: small date strip + 2 icon buttons (progress, add).

Hero: **"what's next" card** — source ribbon (parent board name + age), task title, body preview (first ~80 chars of plaintext extract), black pill `start this →` with coral arrow + circular `↻ not this` swap.

Below: **alternatives** — up to 3 floating pills showing other active task pages.

Below: **today's wins** — `wins` table where `occurred_at::date = today`, sorted desc.

Bottom: 3-tab nav — **focus / boards / notes**.

### 2. Page view (the universal editor)

Opens for any page on tap. Full-screen slide-in.

Top: source breadcrumb (parent → this page), small. Title is the hero — Fraunces ~36px, editable inline.

For `type='task'`: action pill row under title (horizontal scroll): `+ add a timer`, `+ add reminder`, `+ add link`, `+ link a page`, `+ add image`, `+ snooze`, `+ delegate`. In stages 1+2, only `add a timer` and `link a page` are functional; rest open "coming soon" sheet.

Body: Tiptap editor on cream bg, no card chrome. Slash menu, floating toolbar, page mentions all work.

For `type='task'`: a structured checklist section under body if `properties.checklist` has items. Inline Tiptap TaskList works for ad-hoc checkboxes in body.

Below body: **child pages** section if any exist (small inline list with "+ add subpage").

Bottom of page: **backlinks** section if any.

Bottom of screen (fixed): centered `close ✓` pill. If anything was ticked during session, show summary popup before closing.

### 3. Boards view

Lists pages of `type='board'`. Tap a board → kanban view: child pages of `type='task'`, grouped by `properties.status` or `properties.column_id`. Horizontal-scroll columns. Long-press a task to cycle status. Tap to open page view.

In stages 1+2: shows just the default board with default columns (today/doing/waiting/done). Multi-board UI in stage 3.

### 4. Notes view

Lists pages of `type='note'` and `type='plain'`, sorted by `updated_at desc`. Title + body preview per row. `+ new note` at top right.

Nesting visible: child pages show in page view as inline list above backlinks.

## AI features (Claude Haiku 4.5)

Four features via Supabase Edge Functions. `ANTHROPIC_API_KEY` is a Supabase secret. Architecture:

```
client → edge function (verify JWT, call Anthropic, log to ai_calls) → response
```

### Feature 1: task capture

`+` button on focus screen → bottom sheet with textarea. User dumps text. `✦ parse` → 1-N task pages proposed. User confirms/edits/discards each. Save creates pages with `type='task'`, `parent_id` set to default board.

**System prompt** must include the tone rules. Output schema:
```json
{ "tasks": [{ "title": "...", "body_text": "...", "suggested_board": "..." }] }
```

### Feature 2: pull tasks from page

`✦ pull tasks from this` button on any page. Extracts actionable tasks from the body (plaintext from Tiptap). Creates tasks with `parent_id = this page` AND adds entries to `page_links` so backlinks show the relationship.

Output schema same as Feature 1.

### Feature 3: break this down

`✦ break this down` button on task pages, visible when `properties.checklist` is empty/missing. Returns 3-5 concrete starter steps. User accepts/dismisses each; accepted items go into `properties.checklist`.

Output schema:
```json
{ "steps": ["...", "...", "..."] }
```

Each step: under 10 minutes, action-verb + object, first step is the easiest entry point. No filler.

### Feature 4: stuck mode

`✦ i'm stuck` on task pages, always visible. Reads title + body plaintext + ticked checklist items. Returns one short response: either a specific question OR one tiny action (≤40 words, never both).

Output schema:
```json
{ "response": "...", "kind": "question" | "action" }
```

Shows as butter-colored card under title, dismissable.

### Tone for all AI responses

User writes lowercase, hates corporate/coach tone. System prompts must enforce:
- lowercase output (except proper nouns)
- brief, no preamble
- no "Great task!" type filler
- competent-user tone, never patronizing

### Error handling

Failed AI calls show inline error and never block manual flow. AI is a shortcut, not a dependency.

## Focus screen logic (stages 1+2)

Transparent heuristic, no ML:

1. Pages where `type='task'`, `completed_at is null`, `(snoozed_until is null or snoozed_until < now())`, owner_id = current user
2. Sort:
   - `updated_at >= now() - interval '24 hours'` first (continuity wins)
   - then `created_at asc` (oldest unfinished bubbles up)
3. Skip tasks dismissed in current session (in-memory)

Smart recommender is stage 4+.

## Future-proofing for collaboration (stage 4)

Schema accepts a `memberships` table layered on later without painful migration:
- All access-controlled tables use `owner_id` as creator, NOT as sole access gate
- A future `memberships (entity_type, entity_id, user_id, role)` table will sit alongside; RLS updates to "owner OR member"
- Per-user state goes in join tables, never on the main entity (e.g. don't put `starred` on `pages` — use a `page_user_state` table when needed)
- Sharing model when added: **per-board** (a board page and all its descendant tasks), invite by email, roles `viewer`/`editor`

Patrick wants per-board sharing — not whole-workspace, not single-task.

## Build stages

### Stages 1 + 2 (current — combined first build)

- Auth (magic link)
- Supabase schema + RLS (pages, page_links, page_actions, wins, ai_calls, profiles)
- Trigger: on new user signup, create default board page with 4 default child task pages (sample content)
- **Page view** (universal editor) — Tiptap with slash menu, mentions, floating toolbar, autosave, backlinks at bottom
- **Focus screen** with heuristic
- **Notes view** (list + edit, supports nesting)
- **Boards view** (read-only, default board only with kanban grouping by status)
- **All 4 AI features** with edge functions deployed
- **PWA installable** (manifest, icons, service worker)
- **Deployed to todo.noti.au** via wrangler

Out of scope until stage 3+:
- Multi-board creation/editing, custom columns, board drag/drop
- Action pills beyond timer + link a page (reminder/url/image/snooze/delegate show "coming soon")
- Push notifications, lock-screen timer
- Smart recommender (AI for focus screen)
- End-of-day reflection
- Time estimates
- Collaboration

### Stage 3 (future)

- Multi-board UI, board creation, custom columns
- Drag-and-drop between columns
- All remaining action pills functional
- Push notifications + timer-on-lock-screen via Web Push API + edge function push server

### Stage 4 (future)

- `memberships` table + RLS update
- Per-board sharing: invite by email, viewer/editor roles
- Realtime sync via Supabase Realtime
- Presence indicators
- Activity notifications

### Stage 5 (future)

- Public landing page
- Onboarding for new users
- Billing if applicable
- Sentry, analytics
- Soft launch

## Validation gate between stages 1+2 and stage 3

Patrick has committed: **3 days minimum of daily personal use before opening claude code for stage 3.** This is non-negotiable in the spirit of the build. The point is to discover what's actually missing vs. what only feels missing.

If you (Claude) see Patrick coming back to start stage 3 before that validation period, ask: "have you used it daily for 3 days yet?" — and don't start stage 3 work until that's true.

## What to do when starting a new session

1. Read this file, `git log --oneline -20`, and `design-reference.html`.
2. Confirm current stage and what's working.
3. Ask Patrick what's the goal for the session before changing anything.
4. Match the design system. When in doubt, open `design-reference.html`.
5. Commit early and often with clear messages.
