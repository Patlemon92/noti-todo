/**
 * Turns one line of typing into a card (or a routine), instantly, on the
 * phone. No model: prefixes, a few date words and #tags cover most of what
 * gets typed. What it can't place is left for Pocket's brain to sort later.
 *
 *   "hub: export button cut off friday 3pm #urgent"
 *     → Nifty Hub · task · due Friday 15:00 · tag urgent
 *   "idea for neeve: parents book from the reminder text" → Neeve · idea
 *   "every monday check supplies"                         → routine, weekly:1
 */

export type Kind = 'task' | 'fix' | 'idea' | 'reminder' | 'question' | 'info';

export interface ProjectRef {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
}

export interface Parsed {
  title: string;
  projectId: string | null;
  kind: Kind | null; // null: not said, the caller decides
  dueDate: string | null; // YYYY-MM-DD, Sydney
  dueTime: string | null; // HH:MM, Sydney
  tags: string[];
  routine: string | null; // daily | weekdays | weekly:0-6 | monthly:1-31
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_RE = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

const dayIndex = (w: string) => DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));

/** Today's date in Sydney as YYYY-MM-DD, and its weekday. */
export function sydneyToday(now = new Date()): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, weekday: DAYS.findIndex((d) => d.startsWith(get('weekday').toLowerCase())) };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function findProject(projects: ProjectRef[], word: string): ProjectRef | null {
  const w = word.trim().toLowerCase();
  if (!w) return null;
  return (
    projects.find((p) => p.slug === w) ??
    projects.find((p) => p.aliases.map((a) => a.toLowerCase()).includes(w)) ??
    projects.find((p) => p.name.toLowerCase() === w) ??
    null
  );
}

function time(h: string, m: string | undefined, ap: string | undefined): string | null {
  let hh = Number(h);
  const mm = m ? Number(m) : 0;
  if (ap) {
    if (hh < 1 || hh > 12) return null;
    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
  } else if (hh > 23) return null;
  if (mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseQuickAdd(input: string, projects: ProjectRef[], now = new Date()): Parsed {
  let text = input.replace(/\s+/g, ' ').trim();
  const out: Parsed = { title: '', projectId: null, kind: null, dueDate: null, dueTime: null, tags: [], routine: null };
  const cut = (re: RegExp) => { text = text.replace(re, ' ').replace(/\s+/g, ' ').trim(); };
  const { date: today, weekday } = sydneyToday(now);

  // "idea for neeve: …", "fix hub: …", "neeve idea: …"
  let m = text.match(/^(idea|fix|info|note)\s+(?:for\s+)?([^:]{1,30}):\s*/i);
  if (m && findProject(projects, m[2])) {
    out.kind = m[1].toLowerCase() === 'note' ? 'info' : (m[1].toLowerCase() as Kind);
    out.projectId = findProject(projects, m[2])!.id;
    text = text.slice(m[0].length);
  }
  // "hub: …" — only a real project counts, so "re: …" stays text.
  m = text.match(/^([^:]{1,30}):\s*/);
  if (m && !out.projectId && findProject(projects, m[1])) {
    out.projectId = findProject(projects, m[1])!.id;
    text = text.slice(m[0].length);
  }
  // "idea: …" / "fix: …" with no project.
  m = text.match(/^(idea|fix|info)\s*:\s*/i);
  if (m) { out.kind = m[1].toLowerCase() as Kind; text = text.slice(m[0].length); }

  // #tags
  text = text.replace(/(^|\s)#([a-z0-9][\w-]{0,24})/gi, (_all, sp, t) => { out.tags.push(t.toLowerCase()); return sp; }).trim();

  // Routines: "every day", "every weekday", "every monday", "every month on the 7th", "on the 7th of every month"
  const lower = () => text.toLowerCase();
  if ((m = lower().match(/\b(?:every ?day|daily)\b/))) { out.routine = 'daily'; cut(/\b(?:every ?day|daily)\b/i); }
  else if ((m = lower().match(/\bevery (?:week ?day|weekday)s?\b/))) { out.routine = 'weekdays'; cut(/\bevery (?:week ?day|weekday)s?\b/i); }
  else if ((m = lower().match(new RegExp(`\\bevery ${DAY_RE}\\b`)))) { out.routine = `weekly:${dayIndex(m[1])}`; cut(new RegExp(`\\bevery ${DAY_RE}\\b`, 'i')); }
  else if ((m = lower().match(/\b(?:every|each) month(?:ly)?(?: on the (\d{1,2})(?:st|nd|rd|th)?)?\b|\bmonthly(?: on the (\d{1,2})(?:st|nd|rd|th)?)?\b|\bon the (\d{1,2})(?:st|nd|rd|th)? of (?:every|each) month\b/))) {
    const dom = Number(m[1] || m[2] || m[3] || today.slice(8));
    if (dom >= 1 && dom <= 31) { out.routine = `monthly:${dom}`; text = text.replace(new RegExp(m[0], 'i'), ' ').replace(/\s+/g, ' ').trim(); }
  }

  // A time: "at 3pm", "3:30pm", "12.30", "at 14:00"
  const tRe = /\b(?:at )?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)\b|\bat (\d{1,2})[:.](\d{2})\b/i;
  if ((m = text.match(tRe))) {
    const t = m[1] ? time(m[1], m[2], m[3]?.toLowerCase()) : time(m[4], m[5], undefined);
    if (t) { out.dueTime = t; cut(tRe); }
  }

  // A date (not for routines: they come round by themselves)
  if (!out.routine) {
    const dRes: [RegExp, (m: RegExpMatchArray) => string | null][] = [
      [/\b(today|tonight)\b/i, () => today],
      [/\b(tomorrow|tmrw|tmr)\b/i, () => addDays(today, 1)],
      [new RegExp(`\\bnext ${DAY_RE}\\b`, 'i'), (x) => addDays(today, ((dayIndex(x[1].toLowerCase()) - weekday + 7) % 7 || 7) + 7)],
      [new RegExp(`\\b(?:on |this )?${DAY_RE}\\b`, 'i'), (x) => addDays(today, (dayIndex(x[1].toLowerCase()) - weekday + 7) % 7 || 7)],
      [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MON_RE}\\b`, 'i'), (x) => dayMonth(Number(x[1]), x[2])],
      [new RegExp(`\\b${MON_RE} (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (x) => dayMonth(Number(x[2]), x[1])],
      [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (x) => dmy(Number(x[1]), Number(x[2]), x[3])],
      [/\bin (\d{1,2}) days?\b/i, (x) => addDays(today, Number(x[1]))],
      [/\bnext week\b/i, () => addDays(today, ((1 - weekday + 7) % 7) || 7)],
    ];
    for (const [re, fn] of dRes) {
      const x = text.match(re);
      const d = x && fn(x);
      if (d) { out.dueDate = d; cut(re); break; }
    }
    // A time on its own means today (or tomorrow, if that time has passed).
    if (out.dueTime && !out.dueDate) out.dueDate = today;
  }

  function dayMonth(d: number, mon: string): string | null {
    const mi = MONTHS.indexOf(mon.toLowerCase().slice(0, 3));
    if (mi < 0 || d < 1 || d > 31) return null;
    const y = Number(today.slice(0, 4));
    let cand = `${y}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (cand < addDays(today, -60)) cand = `${y + 1}${cand.slice(4)}`; // "3 jan" said in December
    return cand;
  }
  function dmy(d: number, mo: number, y?: string): string | null {
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : Number(today.slice(0, 4));
    let cand = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!y && cand < addDays(today, -60)) cand = `${year + 1}${cand.slice(4)}`;
    return cand;
  }

  // Tidy what's left into a title.
  text = text.replace(/^(?:to |on |by |at |for )/i, '').replace(/\s+(?:on|by|at|for)$/i, '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
  out.title = text ? text.charAt(0).toUpperCase() + text.slice(1) : input.trim();
  if (out.title.length > 300) out.title = `${out.title.slice(0, 297)}…`;
  if (!out.kind && /\b(broken|bug|fails?|failing|not working|cut off|wrong|error|crash(?:es|ing)?)\b/i.test(out.title)) out.kind = 'fix';
  return out;
}
