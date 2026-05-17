import type { TaskRecurrence } from './types';

/** Given a recurrence rule and the moment a task was completed, compute the
 * next occurrence's start time. Always lands on 09:00 local for that day. */
export function nextOccurrence(rule: TaskRecurrence, from = new Date()): Date {
  const d = new Date(from.getTime());
  switch (rule.rule) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekdays':
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6); // skip sat/sun
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'custom':
      d.setDate(d.getDate() + Math.max(1, rule.every_n_days ?? 1));
      break;
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

export const RECURRENCE_LABELS: Record<TaskRecurrence['rule'], string> = {
  daily: 'every day',
  weekdays: 'weekdays only',
  weekly: 'every week',
  biweekly: 'every 2 weeks',
  monthly: 'every month',
  custom: 'every N days',
};

export function describeRecurrence(r?: TaskRecurrence): string | null {
  if (!r) return null;
  if (r.rule === 'custom') {
    const n = Math.max(1, r.every_n_days ?? 1);
    return n === 1 ? 'every day' : `every ${n} days`;
  }
  return RECURRENCE_LABELS[r.rule];
}
