import { coverPatternStyle, coverStyle, ribbonHex } from '../../lib/covers';
import type { NoteCover } from '../../lib/types';

interface Props {
  cover: NoteCover;
  title: string;
  pageCount: number;
  /** Pre-formatted relative time (e.g. "2d"); caller owns date formatting. */
  updatedLabel: string;
}

/**
 * The traveler's-notebook cover face. Pure visual — fills its positioned
 * parent (which owns the border / shadow / rounding / overflow). Used both on
 * the shelf and as the live preview in the cover editor.
 */
export default function CoverArt({ cover, title, pageCount, updatedLabel }: Props) {
  const style = coverStyle(cover);

  return (
    <span className="absolute inset-0 block" style={{ background: style.fill }}>
      {/* paper pattern */}
      <span aria-hidden className="absolute inset-0" style={coverPatternStyle(cover.pattern, style.ink)} />

      {/* faint binding line down the spine side */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-[9px] w-px"
        style={{ background: style.ink, opacity: 0.18 }}
      />

      {/* ribbon marker hanging from the top */}
      {cover.ribbon && (
        <span
          aria-hidden
          className="absolute top-0 left-[26%] h-[38%] w-[7px] border-x border-ink/20"
          style={{ background: ribbonHex(cover.ribbon) }}
        >
          <span
            className="absolute -bottom-[5px] left-0 h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent"
            style={{ borderTopColor: ribbonHex(cover.ribbon) }}
          />
        </span>
      )}

      {/* elastic band */}
      <span
        aria-hidden
        className="absolute inset-y-0 right-[11px] w-[3px]"
        style={{ background: style.ink, opacity: 0.26 }}
      />

      {/* title label */}
      <span className="absolute left-3 right-[26px] top-[26px] block rounded-[6px] border-[1.5px] border-ink bg-bg-soft px-2 py-1.5 shadow-[1.5px_1.5px_0_#2a2520]">
        <span className="block font-serif text-[13.5px] font-semibold leading-tight text-ink line-clamp-3">
          {title}
        </span>
      </span>

      {/* footer: updated + page count, in the cover's own ink */}
      <span
        className="absolute bottom-2.5 left-3 right-[26px] flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-mono"
        style={{ color: style.inkSoft }}
      >
        <span>{updatedLabel}</span>
        {pageCount > 1 && <span>{pageCount} pg</span>}
      </span>

      {/* dog-eared corner fold, bottom-right */}
      <span
        aria-hidden
        className="absolute bottom-0 right-0 h-0 w-0 border-b-[16px] border-l-[16px] border-l-transparent"
        style={{ borderBottomColor: '#f3ebd9', filter: 'drop-shadow(-1px -1px 0 #2a2520)' }}
      />
    </span>
  );
}
