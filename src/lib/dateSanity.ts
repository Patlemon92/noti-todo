// ============================================================================
// dateSanity — post-extraction checks the AI shouldn't be trusted to do
// reliably. Imported by both the client (confirm screen) and the
// extract-journal-snap edge function (Deno). No deps beyond built-ins so
// the same source compiles in both runtimes.
//
// Functions:
//   resolveDayDateMismatch — Patrick's example: "Monday 23rd May 2026"
//     should resolve to 2026-05-25 (the real Monday near that date)
//   flagIfPast — is a parsed due-at already in the past
//   normalizeTime — "1pm" → ISO timestamp today/tomorrow depending on now
//   findRecentDuplicate — same item appearing on two consecutive snaps
// ============================================================================

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function parseDayName(name?: string | null): number | null {
  if (!name) return null;
  const idx = DAY_NAMES.indexOf(name.trim().toLowerCase());
  return idx >= 0 ? idx : null;
}

function parseMonthName(name?: string | null): number | null {
  if (!name) return null;
  const lc = name.trim().toLowerCase();
  // accept short forms (jan, feb, sept, sep, …)
  const idx = MONTH_NAMES.findIndex((m) => m === lc || m.startsWith(lc));
  return idx >= 0 ? idx : null;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DayMismatchInput {
  day?: string | null;
  dateNumber: number;
  month?: string | null;
  year?: number | null;
}

export interface DayMismatchResult {
  /** ISO date (yyyy-mm-dd). Empty string if input couldn't be parsed. */
  date: string;
  flag: 'day-mismatch' | null;
  /** Up to 2 nearest matching alternatives when flagged. Closest first. */
  suggestions: string[];
  /** Echo of normalised input for the UI. */
  raw: DayMismatchInput;
}

/**
 * If the named day (e.g. "Monday") doesn't match the actual weekday of the
 * given date, return the nearest date in either direction that does. Useful
 * for the common journal pattern where Patrick writes "Monday 23rd May"
 * when he means "Monday 25th May".
 *
 * Examples
 *   resolveDayDateMismatch({ day: 'Monday', dateNumber: 23, month: 'May', year: 2026 })
 *     → { date: '2026-05-25', flag: 'day-mismatch', suggestions: ['2026-05-25', '2026-05-18'] }
 *
 *   resolveDayDateMismatch({ day: 'Monday', dateNumber: 25, month: 'May', year: 2026 })
 *     → { date: '2026-05-25', flag: null, suggestions: [] }
 */
export function resolveDayDateMismatch(
  input: DayMismatchInput,
  ref: Date = new Date(),
): DayMismatchResult {
  const year = input.year ?? ref.getFullYear();
  const monthIdx = input.month ? parseMonthName(input.month) : ref.getMonth();
  const dayIdx = parseDayName(input.day);

  if (monthIdx == null) {
    return {
      date: '',
      flag: null,
      suggestions: [],
      raw: { ...input, year },
    };
  }

  const candidate = new Date(year, monthIdx, input.dateNumber);
  const candidateIso = toIsoDate(candidate);

  // no day name to check against — accept candidate verbatim
  if (dayIdx == null) {
    return { date: candidateIso, flag: null, suggestions: [], raw: { ...input, year } };
  }

  if (candidate.getDay() === dayIdx) {
    return { date: candidateIso, flag: null, suggestions: [], raw: { ...input, year } };
  }

  // Look for the nearest weekday match in either direction, capped at ±7
  const suggestions: string[] = [];
  outer: for (let delta = 1; delta <= 7; delta++) {
    for (const sign of [-1, 1]) {
      const probe = new Date(candidate);
      probe.setDate(probe.getDate() + sign * delta);
      if (probe.getDay() === dayIdx) {
        suggestions.push(toIsoDate(probe));
        if (suggestions.length >= 2) break outer;
      }
    }
  }

  return {
    date: suggestions[0] ?? candidateIso,
    flag: 'day-mismatch',
    suggestions: suggestions.slice(0, 2),
    raw: { ...input, year },
  };
}

/** True if `dueAt` is strictly before `now`. Useful to skip auto-creating
 * reminders for items the journal already references as past events. */
export function flagIfPast(dueAt: string, now: Date = new Date()): boolean {
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

/**
 * Parse loose time strings ("1pm", "13:00", "1:30pm", "9am") and return an
 * ISO timestamp. If the time today is still ahead of `now`, returns today
 * at that time; otherwise rolls to tomorrow.
 *
 * Returns null on unparseable input — caller should then surface for manual fix.
 */
export function normalizeTime(timeStr: string, now: Date = new Date()): string | null {
  const m = timeStr
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];

  if (isNaN(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  // Reject ambiguous bare "13"+pm etc — but already covered by the regex
  if (hour > 23) return null;

  const today = new Date(now);
  today.setHours(hour, minute, 0, 0);
  if (today.getTime() >= now.getTime()) return today.toISOString();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString();
}

/**
 * Find the first existing item whose normalised title matches `title` and
 * was created within `withinDays` of `now`. Returns null when nothing
 * matches.
 *
 * Title normalisation: lowercase → strip non-word chars → collapse whitespace.
 * That's enough to catch "Follow up Travis" appearing on monday's page
 * and again on wednesday's page as the same intent.
 */
export function findRecentDuplicate<T extends { title: string; created_at: string }>(
  title: string,
  existing: T[],
  withinDays = 7,
  now: Date = new Date(),
): T | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const needle = norm(title);
  if (!needle) return null;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - withinDays);

  for (const e of existing) {
    if (new Date(e.created_at).getTime() < cutoff.getTime()) continue;
    if (norm(e.title) === needle) return e;
  }
  return null;
}
