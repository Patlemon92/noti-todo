import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';

/**
 * Front door, post-pivot. Replaces FocusView in role.
 *
 * MVP stub: shows the empty-state until the snap-and-extract flow lands
 * (see docs/journal-companion-plan.md phases 4-7). Dated items + loose ends
 * get wired here in phase 7.
 */
export default function TodayView() {
  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">today</h1>
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            0 poking
          </span>
        </div>

        <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
          <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
            nothing poking yet.
          </p>
          <p className="mb-5 text-[13px] text-ink-soft">
            snap a page when you've got something. dated items show up here,
            loose to-dos pile up below.
          </p>
          <Link
            to="/snap"
            className="inline-flex items-center gap-2 rounded-[14px] border-2 border-ink bg-peach-deep px-4 py-2 font-sans text-[14px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm"
          >
            <Camera size={18} strokeWidth={2.25} aria-hidden />
            <span>snap a page</span>
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
