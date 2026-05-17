# noti-todo — system aliveness & automation

A planning doc capturing two related conversations from the initial design chat: how the app's automations should work, and how the system should feel "alive" in ways that genuinely help ADHD brains.

These are not in stages 1+2. This doc exists so future-Patrick (or a future planning chat) can return to these ideas at the right time without re-deriving them.

---

## The big idea

An ADHD-friendly app shouldn't just store tasks — it should **act on your behalf** so the workspace stays calm, the present stays uncluttered, and the past stays accessible. The system feels alive when it does maintenance for you, remembers context you couldn't, and occasionally extends small kindnesses without being patronizing.

This is a design philosophy, not a feature. It informs many small decisions across the app.

---

## Part 1 — Automation

### Three categories of automation needed

1. **Time-triggered** — "at this time, do this"
   - example: at 1am every night, move completed tasks to the archive
   - example: every Monday 9am, create the "team standup" task

2. **Time + condition** — "at this time, if this isn't done, do this"
   - example: at 5pm, if "send invoice" isn't done, remind me

3. **Event-triggered** — "when X happens, do Y"
   - example: when a task is completed on the Work board, move it to the Personal board's "shared wins" column
   - example: when a task is created in board X, set its default status to "today"

This is butler-equivalent in scope. Don't underbuild — Patrick has examples for all three.

### Sequencing

Automation splits into two products:

**A. Always-on built-in behaviors** — non-configurable, just how the app works.
Goes into stages 1+2 or stage 3 (TBD with Patrick).

- Daily archive at 1am user-local time. Completed tasks from yesterday move to a dedicated archive structure, grouped by date column.
- Completed tasks remain visible on their original board until midnight so the user sees today's progress.
- Stale-task gentle prompt: tasks untouched for 30+ days show a soft "still relevant?" affordance when opened — never proactive, never a notification.
- Snoozed tasks return with context: when surfacing again, show "you snoozed this on [day]" rather than silently reappearing.
- New tasks added overnight (by AI capture, by recurring rules, by other people once collab ships) rise to the top of the focus screen in the morning.

**B. User-configurable rules engine** — power-user feature.
Stage 5 or 6, after the app is public-ready.

A simple rule builder: three dropdowns — `when` (time / time+condition / event) × `if` (filter) × `then` (action). No DSL. No code. Per-rule run log so the user can trust what fired and when. Safety: max actions per run, max chain depth of 3, kill switch.

### Required prep in earlier stages

Even if no user-facing rules engine ships before stage 5, the schema must support it:

- Every state change in the app (task completed, task moved, task created, task snoozed, etc.) emits an **event** logged to a `page_events` table.
- The focus screen, wins feed, and built-in automations already read from this event log.
- When the rules engine ships, rules just subscribe to the same events. No rewrite, no migration.

Schema sketch:

```sql
page_events
  id uuid pk
  page_id uuid references pages(id) on delete cascade
  user_id uuid references profiles(id) on delete cascade
  event_type text not null      -- 'created'|'completed'|'moved'|'status_changed'|'snoozed'|'archived'
  payload jsonb default '{}'    -- e.g. {old_status, new_status} for moves
  occurred_at timestamptz default now()
```

### Why a real engine matters

You can solve specific automations as one-off built-in features (recurring tasks, daily archive). That covers ~80% of butler use cases without building a runtime.

But Patrick wants event-triggered rules too ("when a task is completed on this board, move it to that column"), and those don't fit the one-off-feature pattern. Either build a rules engine, or expose webhooks and let users wire rules in n8n/make.com.

Patrick has expressed: he wants the system to feel alive and act on his behalf. That's incompatible with shipping webhooks to an external service. Build the engine in-house, when the time is right.

### Reliability requirements (the hard part nobody talks about)

Automation systems break in three specific ways:

1. **Silent failure.** A rule didn't run. User doesn't know why. Loses trust. → Every rule has a "last run" log visible in the UI with status (success/failure/skipped) and reason.
2. **Timezone bugs.** "At 1am" in whose timezone? → All times computed in user timezone, stored in profile.
3. **Runaway actions.** A rule triggers a rule triggers a rule. → Max actions per rule per run, max chain depth, kill switch per rule.

Skip any of these and the feature destroys daily-use habits.

---

## Part 2 — Aliveness

### Framework: three ingredients

**Ingredient 1: The system does maintenance for you.**
Quietly, while you sleep. You wake up to a tidy workspace you didn't have to clean. This builds trust that the system is on your side.

**Ingredient 2: The system remembers context you couldn't.**
Your past-self leaves breadcrumbs your present-self can follow. The system is a memory you don't have. This is the most powerful ingredient for ADHD and almost no app does it.

**Ingredient 3: The system has small kindnesses that feel human.**
Not gamification, not nudges. Acknowledgments that you exist and showed up. This is the hardest to get right — easy to make patronizing. Restraint is everything.

### Concrete ideas by ingredient

#### Maintenance (ingredient 1)

- Daily archive at 1am. (Already in plan; see Part 1.)
- Completed tasks pile up at the bottom of their column instead of vanishing immediately. Visible all day, gone tomorrow.
- Snoozed tasks return with context ("you snoozed this on tuesday, here it is") rather than silently reappearing.
- Stale tasks (30+ days untouched) get a gentle "still relevant?" affordance on the task page. Never proactive. Never a notification.
- Abandoned tasks are never called "overdue" — that word is a guilt-vector. They're "from last week" — neutral, descriptive.
- Each morning, a small acknowledgment: "yesterday you finished 6. fresh page."

#### Memory & continuity (ingredient 2)

- **"Where you left off" card on the focus screen** — not just *which* task, but *what state*: "you were 3 minutes into 'patch createInvoice', notes were open at line 12, you'd just ticked 'open the worker file'". This is the killer feature.
- The wins feed becomes a real journal over time. Scroll back, see months of accumulated proof. For ADHD brains that struggle with "what have i even been doing", this is medicine.
- Time-of-day patterns surface gently: "you usually work on personal stuff in the evening. these 3 from your personal board?" Never instructive, just informative.
- Search remembers. When you search "myob" and pick a task, that task moves up next time you search similar things.
- Half-typed tasks and notes survive. Open the task page, start writing, get distracted for an hour. Come back, it's all there, with a small timestamp: "you were writing this at 3:14pm."
- The app remembers what you dismissed. If you swap away from a task 5 times, it learns not to suggest it again until tomorrow.

#### Small kindnesses (ingredient 3)

**Rules first, because this category is dangerous:**

- Never speak unless spoken to. No notifications with affirmations. No popup compliments. Kindnesses only appear when the user has opened the app.
- Never quantify. No "6-day streak!" No "you completed 87% of your tasks!" Streaks and percentages are guilt-vectors.
- Never compare. Not to yesterday, not to last week, not to other users.
- Let language do the work, not metrics. "you finished 4 things today" is good. "you're 23% better than yesterday" is bad.

**Then, with those rules:**

- Time-of-day greetings that aren't generic. At 11pm: "still going. take care." At 9am Monday: "welcome back." At 2am: "weird hours. you okay?"
- On the focus screen when the user is tired (low energy check-in, or context cues), language softens: "what's possible?" instead of "what's next?"
- Occasional handwritten-feeling messages tucked in unexpected spots, once or twice a month max. Like a sticky note slipped into the corner of your notebook: "the MYOB thing has been here a while. is it actually next? no judgment if it's not."
- The wins feed has a quiet voice. At the end of friday, a small italic line at the top: "good week." or "you got through it." One line, contextual to what happened.
- Stuck mode has a humane tone. Sometimes the AI response is just permission: "this might not be worth doing right now. is there a smaller piece you could pull off, or is the right move to leave it for tomorrow?"

#### Time-aware behavior (ingredient 4 — added on reflection)

The app has a relationship with time. It knows what time of day it is and adjusts subtly:

- **Morning** — clean, energized, "today" is the dominant frame.
- **Afternoon** — still focused but lower stakes, "what's left" framing.
- **Evening** — winding down, "what's done" framing, archive is more visible.
- **Night** — dimmed, smaller, "tomorrow" framing. Anything added now defaults to tomorrow, not today.

Some of this is visual (subtle color shifts in the cream tone, smaller hero numbers at night). Some is language. All of it is: *the app behaves the way a person who knows you would.*

### Trust-building visibility

Built-in behaviors only work if they're reliable and visible. If the archive runs at 1am but the user doesn't know, and one night it silently fails, trust dies.

- Small "last automated at 1:42am — moved 4 tasks to archive" indicator somewhere unobtrusive (settings, or as the first item of the wins feed each morning).
- "Archive completed tasks now" manual trigger available.
- "Undo last archive" for 24 hours after it runs.

### Anti-patterns to actively avoid

These kill the aliveness feel. Worth naming so we don't drift into them.

- Achievement badges, level-ups, XP, streaks of any kind.
- Notification streams about non-actionable system events.
- "AI insights" that feel like coaching.
- Progress bars on emotional content (mood, energy, wellbeing).
- Comparing the user to themselves or others.
- The word "overdue."
- Default-loud language ("Don't forget!", "Time to focus!", "You have 12 incomplete tasks!").
- Patronizing emoji ("Great job 🎉!").

### Implementation reality

Each individual aliveness idea is small — a few hours of work. But they're polish that compounds. Built well, they make the app feel categorically different from todoist or any todo competitor. Built sloppily, they're embarrassing.

Recommended approach:

1. Ship stages 1+2 with **only** the daily archive and "where you left off" features as aliveness. These are core enough they're not optional.
2. Live with the app for the validation period and longer.
3. Add aliveness features one at a time, deliberately.
4. Test each against the rule: **does this feel like a friend or a manager?** Kill anything that feels like a manager.

---

## Open questions for future sessions

- When the user-facing rules engine ships (stage 5/6?), how do we onboard non-technical users to it without it feeling like a power-user feature buried in settings?
- The "where you left off" feature needs session state to be tracked. What level of granularity? (Last opened? Last edited? Cursor position in notes?) Tradeoff between magic and creepy/overhead.
- For the time-of-day language softening — does that need a mood/energy check-in to ground it, or can it work purely from time + activity patterns?
- Does the rules engine need an AI-assisted rule builder? ("describe what you want, AI proposes a rule.") That would make it accessible without a power-user UI. Worth considering when we get there.

---

*This doc was written in the planning chat with Claude on May 16-17, 2026. It captures ideas that aren't in stages 1+2 but are important for the trajectory of the product. Return to this doc when planning stage 3+ work.*
