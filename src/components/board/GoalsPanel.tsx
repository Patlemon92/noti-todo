import { useState } from 'react';
import { createGoal, updateGoal, type Goal } from '../../lib/board';

const COLORS = ['#d48ab8', '#a896d4', '#e88562', '#8db4c8', '#7fb389', '#e8c75f'];

/** The big things, always in sight, never scheduled. */
export default function GoalsPanel({ goals, onChanged }: { goals: Goal[]; onChanged: () => void }) {
  const [title, setTitle] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <h2 className="hidden font-mono text-[18px] uppercase tracking-mono md:block">goals</h2>
      {goals.map((g) => (
        <div key={g.id} className="flex items-center gap-2 rounded-[14px] border-2 border-ink px-3 py-3 shadow-card-sm" style={{ background: g.color }}>
          <span className="min-w-0 flex-1 break-words text-[15px] font-semibold text-ink">{g.title}</span>
          <button className="min-h-[36px] rounded-[8px] bg-surface/70 px-2 text-[12.5px] font-semibold" onClick={async () => { await updateGoal(g.id, { done: true }); onChanged(); }}>reached ✓</button>
        </div>
      ))}
      <form onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await createGoal(title.trim(), COLORS[goals.length % COLORS.length]); setTitle(''); onChanged(); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ a goal" aria-label="add a goal"
          className="min-h-[44px] w-full rounded-[12px] border-[1.5px] border-dashed border-ink/40 bg-transparent px-3 text-[16px] outline-none" />
      </form>
    </div>
  );
}
