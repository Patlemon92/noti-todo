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
          <ul className="mx-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
  const canvas = (page.properties as NoteProperties | undefined)?.canvas;
  const pageCount = canvas?.pages?.length ?? 1;
  const preview = snippet(docToPlaintext(page.body) || page.body_text || '', 90);
  // surface first line of typed canvas content as a tile sub-title
  const canvasFirstLine = canvas?.pages?.[0]?.text?.split('\n')[0]?.trim() ?? '';
  const subtitle = canvasFirstLine || preview;

  return (
    <button
      onClick={onOpen}
      className="group flex aspect-[3/4] h-full w-full flex-col justify-between overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-surface p-2.5 text-left shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="font-serif text-[14px] font-semibold leading-tight line-clamp-2">
          {page.title || 'untitled'}
        </div>
        {subtitle && (
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft line-clamp-3">
            {subtitle}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[9.5px] uppercase tracking-mono text-ink-faint">
        <span>{formatDistanceToNowStrict(new Date(page.updated_at), { addSuffix: false })}</span>
        {pageCount > 1 && <span>{pageCount} pg</span>}
      </div>
    </button>
  );
}
