import { useState } from 'react';
import Sheet from '../ui/Sheet';
import { aiTaskCapture, type CapturedTask } from '../../lib/ai';
import { createPage, getDefaultBoard } from '../../lib/db';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (count: number) => void;
}

type Stage = 'input' | 'parsing' | 'review' | 'saving' | 'error';

export default function CaptureSheet({ open, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [tasks, setTasks] = useState<CapturedTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setText('');
    setTasks([]);
    setError(null);
    setStage('input');
  }

  async function parse() {
    if (!text.trim()) return;
    setStage('parsing');
    setError(null);
    try {
      const board = await getDefaultBoard();
      const r = await aiTaskCapture(text, board?.id ?? '');
      setTasks(r.tasks);
      setStage('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStage('error');
    }
  }

  async function save() {
    setStage('saving');
    try {
      const board = await getDefaultBoard();
      for (const t of tasks) {
        if (!t.title?.trim()) continue;
        await createPage({
          type: 'task',
          title: t.title.trim(),
          parent_id: board?.id ?? null,
          properties: { status: 'today' },
          body: t.body_text
            ? {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: t.body_text }] },
                ],
              }
            : undefined,
        });
      }
      onSaved(tasks.length);
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStage('error');
    }
  }

  async function saveManual() {
    if (!text.trim()) return;
    setStage('saving');
    try {
      const board = await getDefaultBoard();
      await createPage({
        type: 'task',
        title: text.trim(),
        parent_id: board?.id ?? null,
        properties: { status: 'today' },
      });
      onSaved(1);
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStage('error');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="capture"
      subtitle="dump anything. ai will pull out the tasks. or skip parsing and save it as-is."
    >
      {stage !== 'review' && (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="i need oats and to reply to mum and fix the worker tax-code bug…"
          rows={5}
          className="mb-3 w-full resize-y rounded-[10px] border-2 border-ink bg-surface px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
        />
      )}

      {stage === 'parsing' && (
        <div className="py-2 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
          parsing…
        </div>
      )}

      {stage === 'review' && (
        <div className="mb-3">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
            {tasks.length} task{tasks.length === 1 ? '' : 's'} found
          </div>
          <div className="flex flex-col gap-2">
            {tasks.map((t, i) => (
              <div
                key={i}
                className="rounded-[10px] border-[1.5px] border-ink bg-surface px-3 py-2.5 shadow-card-sm"
              >
                <input
                  value={t.title}
                  onChange={(e) =>
                    setTasks((cur) =>
                      cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                  className="block w-full border-none bg-transparent text-[14px] font-semibold outline-none"
                />
                {t.body_text && (
                  <div className="mt-1 text-[12.5px] text-ink-soft">{t.body_text}</div>
                )}
                <button
                  onClick={() => setTasks((cur) => cur.filter((_, j) => j !== i))}
                  className="mt-1.5 font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
                >
                  drop
                </button>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="text-[13px] italic text-ink-soft">
                nothing left — go back and try again
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-[10px] border-[1.5px] border-rose-deep bg-rose/30 px-3 py-2 text-[13px]">
          {error}
          <button
            onClick={() => setStage('input')}
            className="ml-2 font-mono text-[11px] uppercase underline"
          >
            back
          </button>
        </div>
      )}

      {(stage === 'input' || stage === 'error') && (
        <div className="flex gap-2">
          <button onClick={saveManual} disabled={!text.trim()} className="btn flex-1 disabled:opacity-60">
            save as-is
          </button>
          <button
            onClick={parse}
            disabled={!text.trim()}
            className="btn btn-primary flex-1 disabled:opacity-60"
          >
            ✦ parse
          </button>
        </div>
      )}

      {stage === 'review' && (
        <div className="flex gap-2">
          <button onClick={() => setStage('input')} className="btn flex-1">
            back
          </button>
          <button
            onClick={save}
            disabled={tasks.length === 0}
            className="btn btn-primary flex-1 disabled:opacity-60"
          >
            save {tasks.length}
          </button>
        </div>
      )}
    </Sheet>
  );
}
