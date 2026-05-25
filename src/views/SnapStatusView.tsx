import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import ConfirmExtraction from '../components/page/ConfirmExtraction';
import { getSnap, getSnapPhotoUrl, type JournalSnap } from '../lib/journalSnaps';

/**
 * /snap/:id — status screen after upload. Polls journal_snaps every 2s
 * until `processed_at` is set. When the row has a raw_extraction, this
 * view will be replaced by the confirm UI (phase 6). For phase 4 it just
 * shows the processing state + a hint that extraction lands in phase 5.
 */
export default function SnapStatusView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [snap, setSnap] = useState<JournalSnap | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // initial fetch + photo signed url
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getSnap(id);
        if (cancelled || !row) {
          if (!row) setLoadError('snap not found');
          return;
        }
        setSnap(row);
        const url = await getSnapPhotoUrl(row);
        if (!cancelled) setPhotoUrl(url);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'failed to load snap');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // poll for processed_at
  useEffect(() => {
    if (!id) return;
    if (snap?.processed_at) return; // already processed
    const handle = window.setInterval(async () => {
      try {
        const row = await getSnap(id);
        if (row) setSnap(row);
      } catch {
        // ignore transient errors; keep polling
      }
    }, 2000);
    return () => window.clearInterval(handle);
  }, [id, snap?.processed_at]);

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">
            reading your page
          </h1>
          <Link
            to="/today"
            className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
          >
            done for now
          </Link>
        </div>

        {loadError && (
          <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-rose-deep bg-rose/20 px-5 py-7 text-center">
            <p className="mb-2 font-serif text-[18px] italic text-ink">
              couldn't load this snap.
            </p>
            <p className="text-[13px] text-ink">{loadError}</p>
          </div>
        )}

        {!loadError && photoUrl && snap && (
          <>
            {!snap.processed_at && !snap.error && (
              <div className="mx-3.5">
                <div className="overflow-hidden rounded-[18px] border-2 border-ink shadow-card-lg">
                  <img
                    src={photoUrl}
                    alt=""
                    className="block max-h-[60vh] w-full object-contain bg-bg"
                  />
                </div>
                <ProcessingBanner />
              </div>
            )}

            {snap.error && (
              <div className="mx-3.5">
                <div className="overflow-hidden rounded-[18px] border-2 border-ink shadow-card-lg">
                  <img
                    src={photoUrl}
                    alt=""
                    className="block max-h-[60vh] w-full object-contain bg-bg"
                  />
                </div>
                <ErrorBanner message={snap.error} />
              </div>
            )}

            {snap.processed_at && snap.raw_extraction != null && !snap.error && (
              <ConfirmExtraction
                snap={snap}
                photoUrl={photoUrl}
                extraction={snap.raw_extraction}
                onSaved={() => nav('/today')}
              />
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function ProcessingBanner() {
  return (
    <div className="mt-5 rounded-[16px] border-2 border-dashed border-ink-faint bg-bg-soft px-4 py-4 text-center">
      <p className="mb-1 font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
        processing
      </p>
      <p className="text-[13px] text-ink-soft">
        claude is reading your page. usually a few seconds.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-[16px] border-2 border-rose-deep bg-rose/20 px-4 py-4 text-center">
      <p className="mb-1 font-mono text-[12px] uppercase tracking-mono-wide text-ink">
        extraction failed
      </p>
      <p className="text-[13px] text-ink">{message}</p>
    </div>
  );
}

