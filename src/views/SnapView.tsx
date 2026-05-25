import { Link } from 'react-router-dom';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';

/**
 * Placeholder. Real capture + Claude-vision extraction lands in
 * docs/journal-companion-plan.md phases 4-5. This stub exists so the
 * global snap FAB has somewhere to navigate to without 404ing.
 */
export default function SnapView() {
  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">snap a page</h1>
        </div>

        <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
          <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
            not built yet.
          </p>
          <p className="mb-5 text-[13px] text-ink-soft">
            camera + extraction lands in phase 4. the route exists so the
            FAB has somewhere to go.
          </p>
          <Link
            to="/today"
            className="inline-flex items-center gap-1.5 rounded-[14px] border-2 border-ink bg-surface px-4 py-2 font-sans text-[14px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm"
          >
            <span aria-hidden>←</span>
            <span>back to today</span>
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
