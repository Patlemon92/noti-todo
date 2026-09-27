import { describe, it, expect } from 'vitest';
import { parseQuickAdd, type ProjectRef } from '../quickAdd';

const P: ProjectRef[] = [
  { id: 'p-hub', slug: 'hub', name: 'Nifty Hub', aliases: ['nifty hub'] },
  { id: 'p-neeve', slug: 'neeve', name: 'Neeve', aliases: [] },
  { id: 'p-nifty', slug: 'nifty', name: 'Nifty', aliases: ['nifty foods'] },
];
const SUN = new Date('2026-09-27T02:00:00Z'); // Sunday 27 Sep, midday in Sydney
const q = (s: string) => parseQuickAdd(s, P, SUN);

describe('quick add', () => {
  it('prefix, date, time and tags come off; the rest is the title', () => {
    expect(q('hub: export button cut off friday 3pm #urgent')).toEqual({
      title: 'Export button cut off', projectId: 'p-hub', kind: 'fix', dueDate: '2026-10-02', dueTime: '15:00', tags: ['urgent'], routine: null,
    });
  });
  it('ideas and fixes by word, with or without "for"', () => {
    expect(q('idea for neeve: parents book from the reminder text')).toMatchObject({ projectId: 'p-neeve', kind: 'idea', title: 'Parents book from the reminder text' });
    expect(q('fix hub: login slow')).toMatchObject({ projectId: 'p-hub', kind: 'fix' });
    expect(q('idea: a loyalty card')).toMatchObject({ projectId: null, kind: 'idea' });
  });
  it('a colon that is not a project stays in the title', () => {
    expect(q('re: the supplier invoice')).toMatchObject({ projectId: null, title: 'Re: the supplier invoice' });
  });
  it('dates: today, tomorrow, weekdays, next week, 23 oct, oct 23, 23/10', () => {
    expect(q('call mum tomorrow').dueDate).toBe('2026-09-28');
    expect(q('pay rent today').dueDate).toBe('2026-09-27');
    expect(q('ring the bank monday').dueDate).toBe('2026-09-28');
    expect(q('book the ute next tuesday').dueDate).toBe('2026-10-06');
    expect(q('interview hasan 23 oct 12.30pm')).toMatchObject({ dueDate: '2026-10-23', dueTime: '12:30', title: 'Interview hasan' });
    expect(q('coldrite oct 23').dueDate).toBe('2026-10-23');
    expect(q('labour day 5/10').dueDate).toBe('2026-10-05');
    expect(q('renew rego 3 jan').dueDate).toBe('2027-01-03');
  });
  it('"sunday" said on a Sunday means next Sunday, not today', () => {
    expect(q('meal prep sunday').dueDate).toBe('2026-10-04');
  });
  it('routines: every day, weekdays, a weekday, a day of the month', () => {
    expect(q('nifty: who is away every day')).toMatchObject({ routine: 'daily', title: 'Who is away', projectId: 'p-nifty' });
    expect(q('check the gas every wednesday')).toMatchObject({ routine: 'weekly:3', title: 'Check the gas', dueDate: null });
    expect(q('stand-up every weekday').routine).toBe('weekdays');
    expect(q('pay office of state revenue every month on the 7th #accounts')).toMatchObject({ routine: 'monthly:7', tags: ['accounts'], title: 'Pay office of state revenue' });
    expect(q('pay super on the 28th of every month').routine).toBe('monthly:28');
  });
  it('words that merely contain a day or month are left alone', () => {
    expect(q('check the marching schedule')).toMatchObject({ dueDate: null, title: 'Check the marching schedule' });
    expect(q('sunscreen for the van')).toMatchObject({ dueDate: null });
  });
  it('a time alone means today', () => {
    expect(q('supplier call 4pm')).toMatchObject({ dueDate: '2026-09-27', dueTime: '16:00' });
  });
});
