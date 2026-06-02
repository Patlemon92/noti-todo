import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import QuickAddSheet from '../components/page/QuickAddSheet';
import CoverArt from '../components/page/CoverArt';
import CoverSheet from '../components/page/CoverSheet';
import { usePages } from '../hooks/usePages';
import { createPage } from '../lib/db';
import { resolveCover } from '../lib/covers';
import type { NoteProperties, Page } from '../lib/types';

export default function NotesView() {
  const nav = useNavigate();
  const { pages, reload } = usePages({ type: ['note', 'plain'] });
  const [addOpen, setAddOpen] = useState(false);
  const [coverEditing, setCoverEditing] = useState<Page | null>(null);

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
            {pages.length} {pages.length === 1 ? 'notebook' : 'notebooks'}
          </span>
        </div>

        {pages.length === 0 ? (
          <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
            <p className="mb-2 font-serif text-[20px] italic text-ink-soft">no notebooks yet.</p>
            <p className="mb-4 text-[13px] text-ink-soft">
              anything not actionable goes here. ideas, drafts, references.
            </p>
            <button onClick={newNote} className="btn btn-primary">+ new notebook</button>
          </div>
        ) : (
          <ul className="mx-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {pages.map((p) => (
              <li key={p.id}>
                <NotebookCover
                  page={p}
                  onOpen={() => nav(`/page/${p.id}`)}
                  onEditCover={() => setCoverEditing(p)}
                />
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
      <CoverSheet
        page={coverEditing}
        onClose={() => setCoverEditing(null)}
        onSaved={() => void reload()}
      />
      <BottomNav />
    </div>
  );
}

function NotebookCover({
  page,
  onOpen,
  onEditCover,
}: {
  page: Page;
  onOpen: () => void;
  onEditCover: () => void;
}) {
  const props = page.properties as NoteProperties | undefined;
  const cover = resolveCover(props?.cover, page.id);
  const pageCount = props?.canvas?.pages?.length ?? 1;
  const updated = formatDistanceToNowStrict(new Date(page.updated_at), { addSuffix: false });

  return (
    <div className="group relative aspect-[3/4]">
      <button
        onClick={onOpen}
        className="relative block h-full w-full overflow-hidden rounded-[10px] border-2 border-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        <CoverArt
          cover={cover}
          title={page.title?.trim() || 'untitled'}
          pageCount={pageCount}
          updatedLabel={updated}
        />
      </button>

      <button
        onClick={onEditCover}
        aria-label="edit cover"
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink bg-surface font-mono text-[13px] leading-none opacity-0 shadow-card-sm transition-opacity active:translate-x-px active:translate-y-px active:shadow-none group-hover:opacity-100 max-md:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}
