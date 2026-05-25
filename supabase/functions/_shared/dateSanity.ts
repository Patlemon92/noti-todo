// ============================================================================
// dateSanity (edge-function mirror) — keep in sync with src/lib/dateSanity.ts.
// Pure utility; no external deps. Imported by extract-journal-snap.
//
// Only the bits the edge function needs are mirrored:
//   - resolveDayDateMismatch
//   - applyDateSanity (the orchestrating wrapper)
// Time normalisation is left to the client (it owns the user's timezone).
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
  const idx = MONTH_NAMES.findIndex((m) => m === lc || m.startsWith(lc));
  return idx >= 0 ? idx : null;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface DayMismatchInput {
  day?: string | null;
  dateNumber: number;
  month?: string | null;
  year?: number | null;
}

interface DayMismatchResult {
  date: string;
  flag: 'day-mismatch' | null;
  suggestions: string[];
}

/**
 * If the named day (e.g. "Monday") doesn't match the actual weekday of the
 * given date, return the nearest date in either direction that does.
 *
 * UTC-based — the edge function doesn't know the user's timezone, so it
 * works in calendar days and lets the client snap to tz when constructing
 * the final due_at.
 */
export function resolveDayDateMismatch(
  input: DayMismatchInput,
  ref: Date = new Date(),
): DayMismatchResult {
  const year = input.year ?? ref.getUTCFullYear();
  const monthIdx = input.month ? parseMonthName(input.month) : ref.getUTCMonth();
  const dayIdx = parseDayName(input.day);

  if (monthIdx == null) {
    return { date: '', flag: null, suggestions: [] };
  }

  const candidate = new Date(Date.UTC(year, monthIdx, input.dateNumber));
  const candidateIso = toIsoDate(candidate);

  if (dayIdx == null) {
    return { date: candidateIso, flag: null, suggestions: [] };
  }

  if (candidate.getUTCDay() === dayIdx) {
    return { date: candidateIso, flag: null, suggestions: [] };
  }

  const suggestions: string[] = [];
  outer: for (let delta = 1; delta <= 7; delta++) {
    for (const sign of [-1, 1]) {
      const probe = new Date(candidate);
      probe.setUTCDate(probe.getUTCDate() + sign * delta);
      if (probe.getUTCDay() === dayIdx) {
        suggestions.push(toIsoDate(probe));
        if (suggestions.length >= 2) break outer;
      }
    }
  }

  return {
    date: suggestions[0] ?? candidateIso,
    flag: 'day-mismatch',
    suggestions: suggestions.slice(0, 2),
  };
}

// ----------------------------------------------------------------------------
// extraction wrapper: applies sanity checks to raw Claude output
// ----------------------------------------------------------------------------

export interface RawItem {
  title?: string;
  category?: 'reminder' | 'task' | 'note';
  raw_text?: string;
  day_name?: string | null;
  date_number?: number | null;
  month_name?: string | null;
  year?: number | null;
  raw_time_text?: string | null;
  hour?: number | null;
  minute?: number | null;
  confidence?: number;
}

export interface ProcessedItem {
  title: string;
  category: 'reminder' | 'task' | 'note';
  raw_text: string;
  resolved_date: string | null;          // ISO yyyy-mm-dd
  date_suggestions: string[];
  time: { hour: number; minute: number } | null;
  confidence: number;
  flags: string[];
}

export interface ProcessedExtraction {
  items: ProcessedItem[];
  notes_blocks: Array<{ text: string; confidence: number }>;
}

export function applyDateSanity(
  raw: { items?: unknown[]; notes_blocks?: unknown[] },
  now: Date = new Date(),
): ProcessedExtraction {
  const items: ProcessedItem[] = [];
  const todayIso = toIsoDate(now);

  for (const r of (Array.isArray(raw.items) ? raw.items : []) as RawItem[]) {
    if (!r || typeof r.title !== 'string' || !r.title.trim()) continue;
    const flags: string[] = [];

    let resolvedDate: string | null = null;
    let dateSuggestions: string[] = [];

    if (typeof r.date_number === 'number' && r.date_number >= 1 && r.date_number <= 31) {
      const res = resolveDayDateMismatch(
        {
          day: r.day_name ?? null,
          dateNumber: r.date_number,
          month: r.month_name ?? null,
          year: r.year ?? now.getUTCFullYear(),
        },
        now,
      );
      resolvedDate = res.date || null;
      if (res.flag) flags.push(res.flag);
      dateSuggestions = res.suggestions;
    }

    // past-date flag — string compare is fine for ISO dates
    if (resolvedDate && resolvedDate < todayIso) {
      flags.push('past-date');
    }

    const hour = typeof r.hour === 'number' && r.hour >= 0 && r.hour <= 23 ? r.hour : null;
    const minute =
      typeof r.minute === 'number' && r.minute >= 0 && r.minute <= 59 ? r.minute : 0;
    const time = hour != null ? { hour, minute } : null;

    items.push({
      title: r.title.trim().slice(0, 200),
      category:
        r.category === 'reminder' || r.category === 'task' || r.category === 'note'
          ? r.category
          : 'task',
      raw_text: typeof r.raw_text === 'string' ? r.raw_text.slice(0, 500) : r.title.trim(),
      resolved_date: resolvedDate,
      date_suggestions: dateSuggestions,
      time,
      confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
      flags: Array.from(new Set(flags)),
    });
  }

  const notes = Array.isArray(raw.notes_blocks)
    ? (raw.notes_blocks as Array<{ text?: unknown; confidence?: unknown }>)
        .filter((n) => n && typeof n.text === 'string' && (n.text as string).trim())
        .map((n) => ({
          text: (n.text as string).trim().slice(0, 4000),
          confidence:
            typeof n.confidence === 'number'
              ? Math.max(0, Math.min(1, n.confidence))
              : 0.7,
        }))
    : [];

  return { items, notes_blocks: notes };
}
