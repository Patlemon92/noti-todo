import { useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';
import CoverArt from './CoverArt';
import { updatePage } from '../../lib/db';
import {
  COVER_COLORS,
  COVER_PATTERNS,
  RIBBON_COLORS,
  coverStyle,
  resolveCover,
  ribbonHex,
} from '../../lib/covers';
import type { NoteCover, NoteProperties, Page, PastelColor } from '../../lib/types';

interface Props {
  /** The note whose cover is being edited; null = closed. */
  page: Page | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CoverSheet({ page, onClose, onSaved }: Props) {
  return (
    <Sheet
      open={!!page}
      onClose={onClose}
      title="notebook cover"
      subtitle="a color, paper, and an optional ribbon. just for the shelf."
    >
      {page && <CoverForm key={page.id} page={page} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function CoverForm({ page, onClose, onSaved }: { page: Page; onClose: () => void; onSaved: () => void }) {
  const props = (page.properties ?? {}) as NoteProperties;
  const [draft, setDraft] = useState<NoteCover>(resolveCover(props.cover, page.id));
  const [saving, setSaving] = useState(false);

  const pageCount = props.canvas?.pages?.length ?? 1;

  async function save() {
    setSaving(true);
    try {
      await updatePage(page.id, { properties: { ...props, cover: draft } });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* live preview */}
      <div className="flex justify-center">
        <div className="relative aspect-[3/4] w-32 overflow-hidden rounded-[10px] border-2 border-ink shadow-card">
          <CoverArt
            cover={draft}
            title={page.title?.trim() || 'untitled'}
            pageCount={pageCount}
            updatedLabel="now"
          />
        </div>
      </div>

      {/* color */}
      <div>
        <Label>cover</Label>
        <div className="flex flex-wrap gap-2">
          {COVER_COLORS.map((c) => {
            const selected = draft.color === c;
            return (
              <button
                key={c}
                onClick={() => setDraft((d) => ({ ...d, color: c }))}
                aria-label={c}
                aria-pressed={selected}
                className={clsx(
                  'h-9 w-9 rounded-full border-2 transition-transform active:scale-95',
                  selected ? 'border-ink ring-2 ring-coral ring-offset-2 ring-offset-bg' : 'border-ink',
                )}
                style={{ background: coverStyle({ color: c }).fill }}
              />
            );
          })}
        </div>
      </div>

      {/* pattern */}
      <div>
        <Label>paper</Label>
        <div className="flex flex-wrap gap-2">
          {COVER_PATTERNS.map((p) => {
            const selected = (draft.pattern ?? 'blank') === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setDraft((d) => ({ ...d, pattern: p.id }))}
                aria-pressed={selected}
                className={clsx(
                  'rounded-[10px] border-2 border-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-mono transition-transform active:translate-x-px active:translate-y-px',
                  selected ? 'bg-ink text-bg shadow-none' : 'bg-surface shadow-card-sm active:shadow-none',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ribbon */}
      <div>
        <Label>ribbon</Label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDraft((d) => ({ ...d, ribbon: null }))}
            aria-pressed={!draft.ribbon}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-surface font-mono text-[15px] leading-none transition-transform active:scale-95',
              !draft.ribbon && 'ring-2 ring-coral ring-offset-2 ring-offset-bg',
            )}
            aria-label="no ribbon"
          >
            ⊘
          </button>
          {RIBBON_COLORS.map((c: PastelColor) => {
            const selected = draft.ribbon === c;
            return (
              <button
                key={c}
                onClick={() => setDraft((d) => ({ ...d, ribbon: c }))}
                aria-label={`${c} ribbon`}
                aria-pressed={selected}
                className={clsx(
                  'h-9 w-9 rounded-full border-2 border-ink transition-transform active:scale-95',
                  selected && 'ring-2 ring-coral ring-offset-2 ring-offset-bg',
                )}
                style={{ background: ribbonHex(c) }}
              />
            );
          })}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn btn-primary w-full disabled:opacity-60">
        {saving ? 'saving…' : 'save cover'}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[11px] uppercase tracking-mono text-ink-soft">{children}</p>
  );
}
