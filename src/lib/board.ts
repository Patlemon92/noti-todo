/**
 * My Day data. Everything the board shows comes from one load, and every
 * change is applied to the screen first and written after (the database is
 * in Tokyo; the finger is in Sydney). Realtime brings in changes made
 * elsewhere: the other device, the overnight roll, Pocket's brain.
 */
import { supabase } from './supabase';
import { addDays, sydneyToday, type Kind, type ProjectRef } from './quickAdd';

export type Lane = 'today' | 'tomorrow' | 'week' | 'coming' | 'backlog';
export const LANES: { id: Lane; name: string; hint: string }[] = [
  { id: 'today', name: 'today', hint: 'three at a time. the rest can wait.' },
  { id: 'tomorrow', name: 'tomorrow', hint: 'becomes today overnight.' },
  { id: 'week', name: 'this week', hint: 'today is topped up from here each morning.' },
  { id: 'coming', name: 'coming up', hint: 'dated things. they move closer by themselves.' },
  { id: 'backlog', name: 'backlog', hint: 'no date, no rush.' },
];

export interface Project extends ProjectRef {
  color: string;
  place: 'work' | 'home' | 'any';
  sort: number;
  archived: boolean;
}
export interface Goal { id: string; title: string; color: string; sort: number; done: boolean }
export interface Routine { id: string; title: string; project_id: string | null; tags: string[]; rule: string; active: boolean; sort: number }
export interface Step { t: string; done: boolean }
export interface Card {
  id: number;
  title: string;
  body: string | null;
  kind: Kind;
  project_id: string | null;
  goal_id: string | null;
  routine_id: string | null;
  tags: string[];
  lane: Lane | null;
  position: number;
  due_date: string | null;
  due_time: string | null;
  status: 'open' | 'done' | 'dropped' | 'archived';
  done_on: string | null;
  urgent: boolean;
  steps: Step[];
  link_url: string | null;
  origin: string;
  created_at: string;
}

export interface BoardData {
  cards: Card[];
  projects: Project[];
  goals: Goal[];
  routines: Routine[];
  maxToday: number;
}

const CARD_COLS = 'id,title,body,kind,project_id,goal_id,routine_id,tags,lane,position,due_date,due_time,status,done_on,urgent,steps,link_url,origin,created_at';

/** Open cards, plus anything ticked today (it stays on the board, ticked, until the day ends). */
export async function loadBoard(): Promise<BoardData> {
  const today = sydneyToday().date;
  const [cards, projects, goals, routines, settings] = await Promise.all([
    supabase.from('cards').select(CARD_COLS).or(`status.eq.open,and(status.eq.done,done_on.eq.${today})`).order('position'),
    supabase.from('projects').select('id,slug,name,color,aliases,place,sort,archived').order('sort'),
    supabase.from('goals').select('id,title,color,sort,done').eq('done', false).order('sort'),
    supabase.from('routines').select('id,title,project_id,tags,rule,active,sort').order('sort'),
    supabase.from('pocket_settings').select('max_today').maybeSingle(),
  ]);
  for (const r of [cards, projects, goals, routines]) if (r.error) throw r.error;
  if (!projects.data?.length) {
    // First visit: make the starting projects and settings, then load again.
    await supabase.rpc('pocket_setup');
    return loadBoard();
  }
  return {
    cards: (cards.data ?? []) as Card[],
    projects: (projects.data ?? []) as Project[],
    goals: (goals.data ?? []) as Goal[],
    routines: (routines.data ?? []) as Routine[],
    maxToday: settings.data?.max_today ?? 3,
  };
}

/** Days done, newest first: the archive, a column per day. */
export async function loadArchive(days = 30): Promise<Card[]> {
  const from = addDays(sydneyToday().date, -days);
  const { data, error } = await supabase.from('cards').select(CARD_COLS)
    .eq('status', 'done').gte('done_on', from).order('done_on', { ascending: false }).order('position');
  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function createCard(fields: Partial<Card> & { title: string }): Promise<Card> {
  const { data, error } = await supabase.from('cards').insert(fields).select(CARD_COLS).single();
  if (error) throw error;
  return data as Card;
}

export async function updateCard(id: number, fields: Partial<Card>): Promise<void> {
  const { error } = await supabase.from('cards').update(fields).eq('id', id);
  if (error) throw error;
}

export async function createRoutine(fields: Partial<Routine> & { title: string; rule: string }): Promise<void> {
  const { error } = await supabase.from('routines').insert(fields);
  if (error) throw error;
}
export async function updateRoutine(id: string, fields: Partial<Routine>): Promise<void> {
  const { error } = await supabase.from('routines').update(fields).eq('id', id);
  if (error) throw error;
}
export async function deleteRoutine(id: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) throw error;
}
export async function createGoal(title: string, color: string): Promise<void> {
  const { error } = await supabase.from('goals').insert({ title, color });
  if (error) throw error;
}
export async function updateGoal(id: string, fields: Partial<Goal>): Promise<void> {
  const { error } = await supabase.from('goals').update(fields).eq('id', id);
  if (error) throw error;
}

/** The lane a date belongs in (the same rule as lane_for() in the database). */
export function laneFor(date: string | null): Lane {
  const today = sydneyToday().date;
  if (!date) return 'week';
  if (date <= today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date <= addDays(today, 6)) return 'week';
  return 'coming';
}

/** Where a card goes between two neighbours: halfway, so nothing else moves. */
export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return Date.now() / 1000;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** The words for a routine's rule: "every day", "mondays", "the 7th of each month". */
export function ruleWords(rule: string): string {
  if (rule === 'daily') return 'every day';
  if (rule === 'weekdays') return 'weekdays';
  const [k, v] = rule.split(':');
  if (k === 'weekly') return ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'][Number(v)];
  if (k === 'monthly') {
    const n = Number(v);
    const suf = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    return `the ${n}${suf} of each month`;
  }
  return rule;
}

/** "today 3pm", "tomorrow", "fri 2 oct" — and never "overdue". */
export function dueWords(date: string | null, time: string | null): string {
  if (!date) return '';
  const today = sydneyToday().date;
  const t = time ? ` ${hm(time)}` : '';
  if (date === today) return `today${t}`;
  if (date === addDays(today, 1)) return `tomorrow${t}`;
  const d = new Date(`${date}T12:00:00Z`);
  const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase().replace(',', '');
  return date < today ? `from ${label}` : `${label}${t}`;
}
function hm(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}
