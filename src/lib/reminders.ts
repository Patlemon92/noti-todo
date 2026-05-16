import { supabase } from './supabase';

// Reminders ride on page_actions with type='reminder' (per the original brief).
// payload shape:
//   {
//     due_at: ISO timestamp
//     text?: string                      — optional one-line body for the push
//     sent_at?: ISO timestamp | null      — set by the cron job after push
//     dismissed_at?: ISO timestamp | null — set by the user when they cancel/ack
//   }

export interface ReminderPayload {
  due_at: string;
  text?: string;
  sent_at?: string | null;
  dismissed_at?: string | null;
}

export interface Reminder {
  id: string;
  page_id: string;
  payload: ReminderPayload;
  created_at: string;
}

export async function createReminder(input: {
  page_id: string;
  due_at: string;
  text?: string;
}): Promise<Reminder> {
  const payload: ReminderPayload = {
    due_at: input.due_at,
    text: input.text?.trim() || undefined,
  };
  const { data, error } = await supabase
    .from('page_actions')
    .insert({
      page_id: input.page_id,
      type: 'reminder',
      payload,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Reminder;
}

export async function listReminders(pageId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('page_actions')
    .select('*')
    .eq('page_id', pageId)
    .eq('type', 'reminder')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Reminder[];
}

export async function listUpcomingReminders(limit = 20): Promise<Reminder[]> {
  const nowIso = new Date().toISOString();
  // Pull a wide set + filter client-side because payload fields aren't
  // first-class columns — RLS through the pages join handles ownership.
  const { data, error } = await supabase
    .from('page_actions')
    .select('*')
    .eq('type', 'reminder')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const upcoming = ((data ?? []) as Reminder[]).filter((r) => {
    const p = r.payload ?? ({} as ReminderPayload);
    if (p.dismissed_at) return false;
    return !!p.due_at && p.due_at > nowIso;
  });
  upcoming.sort((a, b) => (a.payload.due_at > b.payload.due_at ? 1 : -1));
  return upcoming.slice(0, limit);
}

export async function dismissReminder(id: string): Promise<void> {
  // mark dismissed_at in payload
  const { data, error } = await supabase
    .from('page_actions')
    .select('payload')
    .eq('id', id)
    .single();
  if (error) throw error;
  const next = {
    ...(data?.payload ?? {}),
    dismissed_at: new Date().toISOString(),
  };
  await supabase.from('page_actions').update({ payload: next }).eq('id', id);
}

export async function deleteReminder(id: string): Promise<void> {
  await supabase.from('page_actions').delete().eq('id', id);
}

// ============================================================================
// preset → ISO helpers
// ============================================================================
export type ReminderPreset =
  | 'in-15-min'
  | 'in-1-hour'
  | 'in-3-hours'
  | 'tomorrow-9am'
  | 'next-monday-9am';

export const PRESET_LABELS: Record<ReminderPreset, string> = {
  'in-15-min': 'in 15 min',
  'in-1-hour': 'in 1 hour',
  'in-3-hours': 'in 3 hours',
  'tomorrow-9am': 'tomorrow 9am',
  'next-monday-9am': 'next monday 9am',
};

export function presetToDate(preset: ReminderPreset, from = new Date()): Date {
  const d = new Date(from.getTime());
  switch (preset) {
    case 'in-15-min':
      d.setMinutes(d.getMinutes() + 15);
      return d;
    case 'in-1-hour':
      d.setHours(d.getHours() + 1);
      return d;
    case 'in-3-hours':
      d.setHours(d.getHours() + 3);
      return d;
    case 'tomorrow-9am': {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case 'next-monday-9am': {
      const day = d.getDay(); // 0 sun ... 6 sat
      const daysToMon = ((1 - day + 7) % 7) || 7;
      d.setDate(d.getDate() + daysToMon);
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }
}

/** Returns a value suitable for `<input type="datetime-local">`. */
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(s: string): Date {
  return new Date(s);
}
