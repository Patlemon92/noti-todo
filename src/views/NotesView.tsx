import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import QuickAddSheet from '../components/page/QuickAddSheet';
import { usePages } from '../hooks/usePages';
import { createPage } from '../lib/db';
import { docToPlaintext, snippet } from '../lib/tiptap';
import type { NoteProperties, Page } from '../lib/types';

export default function NotesView() {
  const nav = useNavigate();
  const { pages, reload } = usePages({ type: ['note', 'plain'] });
  const [addOpen, setAddOpen] = useState(false);

  async function newNote() {
    const p = await createPage({ type: 'note', title: '' });
    nav(`/page/${p.id}`);
    void reload();
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip onAdd={() => setAddOpen(true)} />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">notes</h1>
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {pages.length} {pages.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {pages.length === 0 ? (
          <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
            <p className="mb-2 font-serif text-[20px] italic text-ink-soft">no notes yet.</p>
            <p className="mb-4 text-[13px] text-ink-soft">
              anything not actionable goes here. ideas, drafts, references.
            </p>
            <button onClick={newNote} className="btn btn-primary">+ new note</button>
          </div>
        ) : (
          <ul className="mx-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => (
              <li key={p.id}>
                <NoteCard page={p} onOpen={() => nav(`/page/${p.id}`)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void reload()}
      />
      <BottomNav />
    </div>
  );
}

function NoteCard({ page, onOpen }: { page: Page; onOpen: () => void }) {
  const canvasSvg = (page.properties as NoteProperties | undefined)?.canvas?.svg;
  const preview = snippet(docToPlaintext(page.body) || page.body_text || '', 110);
  return (
    <button
      onClick={onOpen}
      className="block h-full w-full overflow-hidden rounded-[14px] border-2 border-ink bg-surface text-left shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
    >
      {canvasSvg ? (
        <div
          className="aspect-[4/3] w-full overflow-hidden bg-bg-soft"
          dangerouslySetInnerHTML={{ __html: scaledSvgForPreview(canvasSvg) }}
        />
      ) : null}
      <div className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-[17px] font-semibold leading-tight">
            {page.title || 'untitled'}
          </span>
          <span className="flex-shrink-0 font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {formatDistanceToNowStrict(new Date(page.updated_at), { addSuffix: false })}
          </span>
        </div>
        {!canvasSvg && preview && (
          <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{preview}</p>
        )}
      </div>
    </button>
  );
}

function scaledSvgForPreview(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<svg([^>]*)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*)\sheight="[^"]*"/, '<svg$1')
    .replace(
      '<svg',
      '<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style="display:block;max-width:100%;"',
    );
}
