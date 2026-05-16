import { Link } from 'react-router-dom';
import { useBacklinks } from '../../hooks/useBacklinks';

interface Props {
  pageId: string;
}

export default function Backlinks({ pageId }: Props) {
  const { pages, loading } = useBacklinks(pageId);
  if (loading || pages.length === 0) return null;

  return (
    <div className="mx-3.5 mb-4">
      <div className="mb-2 px-1 font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
        ↳ linked from
      </div>
      <div className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <Link
            key={p.id}
            to={`/page/${p.id}`}
            className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-surface px-3 py-1.5 text-[13px] shadow-card-sm hover:bg-bg-soft"
          >
            <span className="font-mono text-ink-soft">·</span>
            <span>{p.title || 'untitled'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
