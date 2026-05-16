import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listChildPages, createPage } from '../../lib/db';
import type { Page, PageType } from '../../lib/types';
import { docToPlaintext, snippet } from '../../lib/tiptap';

interface Props {
  parentId: string;
  parentType: PageType;
}

const TYPE_GLYPH: Record<PageType, string> = {
  task: '▢',
  note: '✎',
  board: '▦',
  plain: '·',
};

export default function ChildPages({ parentId, parentType }: Props) {
  const [pages, setPages] = useState<Page[]>([]);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const rows = await listChildPages(parentId);
    setPages(rows);
  }

  useEffect(() => {
    void reload();
  }, [parentId]);

  async function addSubpage() {
    setCreating(true);
    try {
      const type: PageType = parentType === 'board' ? 'task' : 'note';
      await createPage({ type, title: '', parent_id: parentId });
      await reload();
    } finally {
      setCreating(false);
    }
  }

  if (pages.length === 0) {
    return (
      <div className="mx-3.5 mb-4">
        <button
          onClick={addSubpage}
          disabled={creating}
          className="pill-action w-full justify-center"
        >
          <span className="font-mono text-base leading-none text-ink-soft">+</span>
          add subpage
        </button>
      </div>
    );
  }

  return (
    <div className="surface-card mx-3.5 mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-bg-soft px-3.5 py-2.5">
        <h3 className="font-mono text-[14px] uppercase tracking-mono-wide">
          ↳ subpages
        </h3>
        <span className="font-mono text-[12px] text-ink-soft">{pages.length}</span>
      </div>
      <ul>
        {pages.map((p) => {
          const preview = snippet(docToPlaintext(p.body) || p.body_text || '', 60);
          return (
            <li key={p.id} className="border-b border-dashed border-black/10 last:border-b-0">
              <Link
                to={`/page/${p.id}`}
                className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-bg-soft"
              >
                <span className="mt-0.5 font-mono text-ink-soft">{TYPE_GLYPH[p.type]}</span>
                <span className="flex-1">
                  <span className="block text-[14px] font-medium">
                    {p.title || 'untitled'}
                  </span>
                  {preview && (
                    <span className="block text-[12.5px] text-ink-soft">{preview}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        onClick={addSubpage}
        disabled={creating}
        className="block w-full border-t border-dashed border-black/10 bg-bg-soft px-3.5 py-2.5 text-left font-mono text-[12px] uppercase tracking-mono text-ink-soft hover:bg-bg"
      >
        + add subpage
      </button>
    </div>
  );
}
