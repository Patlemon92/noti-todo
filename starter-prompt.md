# your first message to claude code

Copy the entire block below and paste it as your first message after running `claude` in the `noti-todo` folder.

You'll need to have ready:

- your **Supabase project URL** (https://xxxxx.supabase.co)
- your **Supabase anon public key** (eyJ...)
- your **Supabase service_role key** (eyJ... — the SECRET one, for edge functions to insert into ai_calls bypassing RLS)
- your **Anthropic API key** (from console.anthropic.com → API Keys — different from your Claude Code login)
- your **GitHub username** (for repo creation)

This is a long session — budget 4-6 hours, ideally a weekend morning into afternoon. Claude code will do most of the work; your job is to answer questions, paste credentials when asked, and occasionally test things in the browser.

---

## paste this:

I want to scaffold this project from scratch. Read `CLAUDE.md` first — it has the full brief. Then read `design-reference.html` to understand the visual direction (this is a high-fidelity HTML mockup; the React app should match it as closely as possible while adapting to the new everything-is-a-page architecture described in CLAUDE.md).

We are building **stages 1 + 2 combined** as the first deliverable. Future stages (3, 4, 5) are documented in CLAUDE.md so you understand the trajectory and don't paint us into corners.

Work through these phases in order, asking me for input where marked [ASK]. Commit small and often with descriptive messages.

## 1. project setup

- Initialize Vite + React + TypeScript in the current folder using `pnpm`.
- Install Tailwind CSS with PostCSS, Autoprefixer.
- Install dependencies:
  - Core: `@supabase/supabase-js`, `react-router-dom`, `date-fns`, `clsx`
  - Editor: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/suggestion`
  - PWA: `vite-plugin-pwa`
  - Icons (for system icons only, not primary UI): `lucide-react`
- Set up Tailwind to use design tokens from CLAUDE.md as custom colors (cream, ink, coral, peach, butter, mint, lavender, sky, rose; ink-soft / ink-faint).
- Load fonts (Fraunces, VT323, Bricolage Grotesque) from Google Fonts via `index.html` and expose as Tailwind font families.
- Folder structure:

  ```
  src/
    components/
      editor/        # Tiptap setup, slash menu, page mention, floating toolbar
      ui/            # shared primitives (Pill, Card, IconButton, Sheet)
    views/
      FocusView.tsx
      PageView.tsx   # universal editor for any page (task/note/board/plain)
      BoardsView.tsx
      NotesView.tsx
      AuthView.tsx
    lib/
      supabase.ts    # client
      db.ts          # typed query helpers
      types.ts       # TypeScript types matching DB schema
      tiptap.ts      # editor config and extensions
    hooks/
      usePage.ts
      usePages.ts
      useFocusTask.ts
      useWins.ts
      useBacklinks.ts
    pwa/             # SW registration + install prompt
    styles/
      globals.css
  ```

## 2. supabase: schema, RLS, triggers

[ASK] Ask me for: Supabase URL, anon key, AND service_role key. Put URL + anon in `.env.local`; tell me to set the service_role key as a Supabase secret later (don't write it to disk).

Generate `supabase/migrations/001_initial_schema.sql` with:

1. The `profiles`, `pages`, `page_links`, `page_actions`, `wins`, `ai_calls` tables from CLAUDE.md.
2. **Computed column** on `pages` for plaintext extract from `body` (Tiptap JSON), used for previews and search. Use a function `tiptap_to_plaintext(jsonb)` that recursively concatenates text nodes.
3. **Trigger** on `pages` for `updated_at` auto-update.
4. **Trigger** on auth user creation: creates a profile, then creates one default board page (`type='board'`, `title='My Board'`, `properties = '{"color":"sky","columns":[...]}'`) with 4 sample task child pages for first-run UX.
5. **Trigger** on `pages.body` update: parse `body` jsonb for `pageMention` nodes (with attr `id`), refresh `page_links` rows where `source_page_id = NEW.id`.
6. **RLS policies** for every table. Reads/writes filtered by `auth.uid() = owner_id` (or via parent joins for children). Use `using` AND `with check` clauses correctly.
7. Indexes on: `pages(owner_id, type)`, `pages(parent_id)`, `page_links(target_page_id)`, `wins(user_id, occurred_at desc)`, `ai_calls(user_id, created_at desc)`.

Print the migration SQL. Tell me to run it in the Supabase SQL editor (Project → SQL Editor → New Query → paste → Run).

[ASK] After I confirm the migration succeeded, continue.

## 3. auth flow

Build a magic-link auth screen:
- Single input (email) + button (`send link`)
- Cream bg, Fraunces heading "welcome back", coral accent button
- After sign-in, route to `/focus`
- Persistent session across reloads
- Signed-out users always see `/auth`

## 4. tiptap editor (the core component)

This is the most important shared component. Build it once, use it everywhere a page body is rendered.

File: `src/components/editor/PageEditor.tsx`

Features:
- StarterKit extensions (paragraphs, headings 1-3, lists, bold, italic, code, blockquote)
- Link extension (with click-to-edit popover)
- TaskList + TaskItem (inline checkboxes via `[] ` or slash menu)
- Placeholder ("write anything…")
- **PageMention** custom node:
  - Triggered by `@` or `[[`
  - Shows a popup (use `@tiptap/suggestion`) listing the user's pages, fuzzy-searched by title
  - Selecting inserts a non-editable inline pill showing the page title, with the page's `id` as an attribute
  - Renders as a clickable pill in the doc; tap navigates to that page
- **SlashMenu** custom extension:
  - Triggered by `/` at the start of a line
  - Shows a popup with options: Heading 1, Heading 2, Bullet List, Task List, Quote, Code, Link to page
  - Each option transforms the current line/block on selection
- **FloatingToolbar** component that appears on text selection: B, I, H1, H2, • list, link, mention
- Markdown shortcuts via StarterKit's defaults

Persistence:
- `<PageEditor pageId={...} initialBody={...} />` receives the page's body jsonb
- On every change, debounce 500ms, then save to `pages.body` via Supabase
- Show a tiny "saved" indicator briefly after each save
- Optimistic UI — render edits immediately, only show error if save fails

Make this component clean and reusable. Stage 3 will reuse it; stage 4 will swap the save logic for realtime.

## 5. page view (the universal editor surface)

Route: `/page/:id`

Layout (matching design-reference.html's task page where applicable):
- Top: source breadcrumb (parent → this), small. Right: icon button for page menu (delete, archive, change type).
- Title: Fraunces ~36px, weight 500-600, editable inline (debounced save).
- For `type='task'`: action pill row under title (horizontal scroll):
  - `+ add a timer` (functional — opens timer setup sheet)
  - `+ add reminder` (stub — "coming soon" sheet)
  - `+ add link` (stub)
  - `+ link a page` (functional — opens page picker sheet, adds `page_actions` row of type `url_link` with payload `{ page_id }`, also creates a `page_links` row)
  - `+ add image` (stub)
  - `+ snooze` (stub)
  - `+ delegate` (stub)
- Body: `<PageEditor>` mounted with this page's body.
- For `type='task'`: structured checklist section below body, sourced from `properties.checklist`. Tap to toggle; toggling done creates a `wins` row.
- **Child pages** section: lists pages where `parent_id = this page`. Each row tappable. `+ add subpage` at end.
- **Backlinks** section at bottom: pages where `page_links.target_page_id = this page`. Pills linking to source pages.
- Fixed bottom: centered `close ✓` pill. Tap returns to previous route. If any wins were generated during session, show summary popup first.

## 6. focus view

Route: `/focus` (default after login)

- Top strip: date + 2 icon buttons (progress placeholder, `+` add task)
- "What's next" card matching design-reference.html:
  - Source ribbon: parent board name + age ("started 2 days ago")
  - Title (Fraunces 26px)
  - Body preview (first 80 chars of plaintext extract)
  - Pill `start this →` (opens page view) + circle `↻ not this` (dismisses in-memory, refetches next)
- Alternatives: up to 3 more pills
- Today's wins: list from `wins` where `occurred_at::date = today`
- Bottom nav: focus / boards / notes
- Top right `+` button: opens task capture bottom sheet (AI feature 1, see section 8)

Heuristic for "what's next": as documented in CLAUDE.md.

## 7. boards view & notes view

**Boards** (`/boards`): For stages 1+2, just lists the default board with kanban view of its child tasks grouped by `properties.status`. Long-press cycles status. Tap opens page view. Board switcher pill at top opens a bottom sheet with one disabled "+ new board" item.

**Notes** (`/notes`): Lists pages where `type IN ('note', 'plain')`, sorted by `updated_at desc`. Title + plaintext preview per row. `+ new note` at top right (creates a page with `type='note'`, navigates to it).

Both views share the same row component style — a soft pill on cream bg.

## 8. AI features (Supabase Edge Functions)

Four edge functions, all calling Claude Haiku 4.5 (`claude-haiku-4-5`).

[ASK] Ask me for my Anthropic API key. Run:
```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Shared utilities in `supabase/functions/_shared/`:
- `anthropic.ts` — wrapper for calling Anthropic
- `auth.ts` — verify JWT from `Authorization` header, return user_id
- `log.ts` — insert into `ai_calls` (uses service_role key via env)

Functions (each in its own folder):
- `ai-task-capture/` — input: `{ text: string, default_board_id: string }`. Output: `{ tasks: Array<{title, body_text, suggested_board}> }`
- `ai-pull-from-page/` — input: `{ page_id: string }`. Reads the page body, extracts plaintext, calls AI. Output: same as capture, plus `source_page_id` on each task.
- `ai-break-down/` — input: `{ page_id: string }`. Reads title + body plaintext + properties. Output: `{ steps: string[] }` (3-5 items).
- `ai-stuck/` — input: `{ page_id: string }`. Output: `{ response: string, kind: 'question' | 'action' }` (≤40 words).

System prompts must enforce the tone rules from CLAUDE.md (lowercase, brief, no preamble, no patronizing). Include them verbatim in each system prompt.

Each function:
1. Verifies user JWT
2. Reads input
3. Calls Anthropic with `max_tokens` tuned per task (capture: 1000, pull: 1500, break-down: 400, stuck: 150)
4. Parses JSON (use `response_format` if available; otherwise strict prompt + JSON.parse with try/catch)
5. Logs to `ai_calls`
6. Returns parsed JSON

Deploy all four:
```
supabase functions deploy ai-task-capture
supabase functions deploy ai-pull-from-page
supabase functions deploy ai-break-down
supabase functions deploy ai-stuck
```

Wire to UI:
- **Task capture**: `+` button on focus screen → bottom sheet with textarea → `✦ parse` → loading → editable list of proposed tasks → save creates pages
- **Pull from page**: `✦ pull tasks from this` button at top of every page view → same flow as task capture but tasks inherit `parent_id = current page` and a `page_links` row gets created
- **Break this down**: `✦ break this down` button on task pages when `properties.checklist` is empty → returns steps → user accepts each → accepted go to `properties.checklist`
- **Stuck**: `✦ i'm stuck` button always visible on task pages → response shown as butter card under title, dismissable

Each AI button shows a loading state. Errors show inline and never block the manual flow.

## 9. PWA setup

- Configure `vite-plugin-pwa` with manifest: name "noti-todo", short_name "todo", display "standalone", theme_color `#f3ebd9`, background_color `#f3ebd9`, scope "/", start_url "/focus".
- Generate icons: 192x192, 512x512, 180x180 (iOS), and maskable variants. Design: cream bg, a Fraunces "n" or a coral checkmark, hard outlined. Use `sharp` to rasterize from SVG.
- Service worker: precache app shell, NetworkFirst for Supabase requests with reasonable timeout, offline fallback page.
- Add an "Add to Home Screen" prompt for iOS users on first visit (detect via UA + `display-mode: standalone` media query). For Android, use the native `beforeinstallprompt` event.

## 10. github setup

[ASK] Confirm GitHub username and repo name `noti-todo`.

- Initialize git, create `.gitignore` (node_modules, .env.local, .DS_Store, dist, .wrangler, .vite).
- Create repo on GitHub via `gh` CLI if available; otherwise print manual steps.
- Initial commit, push to `main`.

## 11. cloudflare pages deploy via wrangler

Wrangler is already authenticated. Verify: `wrangler whoami`.

```
wrangler pages project create noti-todo --production-branch main
wrangler pages secret put VITE_SUPABASE_URL --project-name noti-todo
wrangler pages secret put VITE_SUPABASE_ANON_KEY --project-name noti-todo
pnpm build
wrangler pages deploy dist --project-name noti-todo --branch main
wrangler pages domain add todo.noti.au --project-name noti-todo
```

Note Patrick the CNAME record if needed (likely auto-provisioned since noti.au is on Cloudflare). Create `wrangler.toml` and a `pnpm deploy` script in `package.json` for future deploys.

## 12. final check

- Test live URL responds
- Confirm PWA manifest loads, service worker registers
- Smoke test:
  - Sign in with magic link
  - Default board appears
  - Open a task page, edit title and body, see autosave
  - Type `@` in body, mention another page, see backlink appear on that page
  - Tap `+` on focus screen, type "i need oats and to fix the worker", confirm AI parses into 2 tasks
  - Tap `✦ break this down` on a task page, confirm steps appear
- Print summary:
  - What's deployed at todo.noti.au
  - What's stubbed (action pills 3-7, multi-board, push notifs, etc.)
  - The `pnpm deploy` command for future deploys
  - Reminder: **3 days of daily use before starting stage 3**

---

Stop and ask me questions any time you're unsure about a design or product decision. Don't guess on UI specifics — open `design-reference.html`. Commit early, commit often, descriptive messages.

Ready? Read CLAUDE.md and design-reference.html, then ask me for my Supabase credentials.
