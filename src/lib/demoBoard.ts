// Development only (never in a production build): a filled board to look at
// and drag around at phone width, without signing in or touching the database.
import type { BoardData, Card } from './board';
import { addDays, sydneyToday } from './quickAdd';

export const isDemo = () => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export function demoBoard(): BoardData {
  const t = sydneyToday().date;
  const P = (id: string, slug: string, name: string, color: string, place: 'work' | 'home' | 'any', sort: number) => ({ id, slug, name, color, aliases: [], place, sort, archived: false });
  const projects = [P('nifty', 'nifty', 'Nifty', '#e88562', 'work', 1), P('hub', 'hub', 'Nifty Hub', '#a896d4', 'work', 2), P('neeve', 'neeve', 'Neeve', '#7fb389', 'home', 3),
    P('noti', 'noti', 'Noti', '#d48a8a', 'home', 4), P('ops', 'ops', 'noti-ops', '#8a8278', 'home', 6), P('life', 'life', 'Life', '#e8c75f', 'any', 7)];
  let n = 30;
  const c = (o: Partial<Card> & { title: string }): Card => ({
    id: n++, body: null, kind: 'task', project_id: null, goal_id: null, routine_id: null, tags: [], lane: 'week', position: n,
    due_date: null, due_time: null, status: 'open', done_on: null, urgent: false, steps: [], link_url: null, origin: 'app', created_at: new Date().toISOString(), ...o,
  });
  return {
    maxToday: 3,
    projects,
    goals: [{ id: 'g1', title: 'Better understanding and use of forecasting', color: '#d48ab8', sort: 1, done: false }, { id: 'g2', title: 'Development of ERP', color: '#a896d4', sort: 2, done: false }],
    routines: [
      { id: 'r1', title: 'Who is away', project_id: 'nifty', tags: [], rule: 'daily', active: true, sort: 1 },
      { id: 'r2', title: 'Pay who needs paying', project_id: 'nifty', tags: ['accounts'], rule: 'daily', active: true, sort: 2 },
      { id: 'r3', title: 'Check supplies', project_id: 'nifty', tags: [], rule: 'weekly:1', active: true, sort: 3 },
      { id: 'r4', title: 'Pay office of state revenue', project_id: 'nifty', tags: ['accounts'], rule: 'monthly:7', active: true, sort: 4 },
    ],
    cards: [
      c({ title: 'Who is away', project_id: 'nifty', lane: 'today', origin: 'routine', routine_id: 'r1', due_date: t }),
      c({ title: 'Pay who needs paying', project_id: 'nifty', lane: 'today', origin: 'routine', routine_id: 'r2', tags: ['accounts'], due_date: t, status: 'done', done_on: t }),
      c({ title: 'Call Coldrite about the servicing on the Moorebank blast freezer before the long weekend', project_id: 'nifty', lane: 'today', due_date: t, due_time: '10:30:00', tags: ['must'] }),
      c({ title: 'Plastic curtains for the lunch area', project_id: 'nifty', lane: 'today' }),
      c({ title: 'Renew noti.com.au domain', project_id: 'ops', lane: 'today', due_date: addDays(t, -1), steps: [{ t: 'open ventraip', done: true }, { t: 'renew 2 years', done: false }] }),
      c({ title: 'Export button cut off on mobile', project_id: 'hub', kind: 'fix', lane: 'today' }),
      c({ title: 'Review corrective action CA129', project_id: 'nifty', lane: 'tomorrow' }),
      c({ title: 'Monday production plan', project_id: 'nifty', lane: 'tomorrow', tags: ['loscam'] }),
      c({ title: 'Give each part of the machine a number so rooms can report issues by number', project_id: 'nifty', lane: 'week' }),
      c({ title: 'Clinician calendar double-books on daylight saving', project_id: 'neeve', kind: 'fix', lane: 'week' }),
      c({ title: 'Dairy 2 not in use: air con being installed', project_id: 'nifty', lane: 'coming', due_date: addDays(t, 4) }),
      c({ title: 'Labour Day public holiday', project_id: 'life', lane: 'coming', due_date: addDays(t, 8) }),
      c({ title: 'Interview: Hasan', project_id: 'nifty', lane: 'coming', due_date: addDays(t, 26), due_time: '12:30:00' }),
      c({ title: 'Staff report card', project_id: 'nifty', lane: 'backlog' }),
      c({ title: 'New container order system', project_id: 'nifty', lane: 'backlog' }),
      c({ title: 'Loyalty stamps for regulars', project_id: 'nifty', kind: 'idea', lane: null }),
      c({ title: 'Parents book straight from the reminder text', project_id: 'neeve', kind: 'idea', lane: null }),
      c({ title: 'Tablet login is slow', project_id: 'hub', kind: 'fix', lane: null }),
      c({ title: 'Loscam: NSW sales rep, ask for Jordan', project_id: 'nifty', kind: 'info', lane: null }),
    ],
  };
}
