import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../ui/Sheet';
import CaptureSheet from './CaptureSheet';
import { createPage } from '../../lib/db';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional: called after a new task or note saves, so parent views can refresh. */
  onSaved?: () => void;
}

/**
 * Two-pick sheet: + task (opens CaptureSheet) or + note (creates blank, navigates).
 * Used by every view's top-right + button.
 */
export default function QuickAddSheet({ open, onClose, onSaved }: Props) {
  const nav = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);

  async function makeNote() {
    const p = await createPage({ type: 'note', title: '' });
    onSaved?.();
    onClose();
    nav(`/page/${p.id}`);
  }

  function openTaskCapture() {
    setCaptureOpen(true);
  }

  return (
    <>
      <Sheet
        open={open && !captureOpen}
        onClose={onClose}
        title="add something"
        subtitle="task for an action. note for a thought, link, or anything not actionable."
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={openTaskCapture}
            className="flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-ink bg-peach px-3 py-6 shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <span className="font-mono text-[24px] leading-none">▢</span>
            <span className="font-serif text-[18px] font-semibold leading-none">
              task
            </span>
            <span className="font-mono text-[10px] uppercase tracking-mono-wide text-ink-soft">
              something to do
            </span>
          </button>
          <button
            onClick={makeNote}
            className="flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-ink bg-mint px-3 py-6 shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <span className="font-mono text-[24px] leading-none">✎</span>
            <span className="font-serif text-[18px] font-semibold leading-none">
              note
            </span>
            <span className="font-mono text-[10px] uppercase tracking-mono-wide text-ink-soft">
              something to keep
            </span>
          </button>
        </div>
      </Sheet>

      <CaptureSheet
        open={captureOpen}
        onClose={() => {
          setCaptureOpen(false);
          onClose();
        }}
        onSaved={(n) => {
          if (n > 0) onSaved?.();
        }}
      />
    </>
  );
}
