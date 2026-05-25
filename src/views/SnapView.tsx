import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import { createSnap, invokeExtraction } from '../lib/journalSnaps';

type Mode = 'pick' | 'preview' | 'uploading' | 'error';

/**
 * Capture screen for the journal-companion flow. User picks/snaps a photo,
 * previews it, then commits — which uploads + inserts a `journal_snaps`
 * row + kicks off the extraction edge function. Navigates to /snap/:id
 * for the processing → confirm sequence.
 */
export default function SnapView() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openPicker() {
    inputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setMode('preview');
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setError(null);
    setMode('pick');
    // give the input a tick to reset before re-opening
    setTimeout(openPicker, 50);
  }

  async function useThis() {
    if (!file) return;
    setMode('uploading');
    setError(null);
    try {
      const snap = await createSnap(file);
      // fire-and-forget; the status page will poll for `processed_at`.
      // in phase 4 the edge function doesn't exist yet — that's fine,
      // status page surfaces "processing" until phase 5 wires extraction.
      void invokeExtraction(snap.id).catch(() => {});
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      nav(`/snap/${snap.id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[snap upload]', err);
      setError(err instanceof Error ? err.message : 'upload failed');
      setMode('error');
    }
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">
            snap a page
          </h1>
          <Link
            to="/today"
            className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
          >
            cancel
          </Link>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          className="hidden"
        />

        {mode === 'pick' && <PickState onOpen={openPicker} />}
        {mode === 'preview' && previewUrl && (
          <PreviewState
            url={previewUrl}
            onRetake={retake}
            onUse={useThis}
          />
        )}
        {mode === 'uploading' && previewUrl && (
          <UploadingState url={previewUrl} />
        )}
        {mode === 'error' && (
          <ErrorState
            message={error ?? 'something went wrong'}
            onRetry={() => {
              setError(null);
              setMode(file ? 'preview' : 'pick');
            }}
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}

// ----------------------------------------------------------------------------
// sub-states
// ----------------------------------------------------------------------------

function PickState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-10 text-center">
      <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
        open your notebook to today.
      </p>
      <p className="mb-6 text-[13px] text-ink-soft">
        snap a page — claude reads it and pulls out dated items, loose to-dos,
        and notes. you confirm what's right before anything saves.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-2 rounded-[14px] border-2 border-ink bg-peach-deep px-5 py-2.5 font-sans text-[15px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm"
      >
        <Camera size={18} strokeWidth={2.25} aria-hidden />
        <span>take or pick a photo</span>
      </button>
    </div>
  );
}

function PreviewState({
  url,
  onRetake,
  onUse,
}: {
  url: string;
  onRetake: () => void;
  onUse: () => void;
}) {
  return (
    <div className="mx-3.5">
      <div className="overflow-hidden rounded-[18px] border-2 border-ink shadow-card-lg">
        <img src={url} alt="" className="block max-h-[60vh] w-full object-contain bg-bg" />
      </div>
      <div className="mt-4 flex items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={onRetake}
          className="rounded-[12px] border-2 border-ink bg-surface px-4 py-2 font-sans text-[14px] font-semibold text-ink shadow-card-sm active:translate-x-[1px] active:translate-y-[1px]"
        >
          retake
        </button>
        <button
          type="button"
          onClick={onUse}
          className="rounded-[12px] border-2 border-ink bg-peach-deep px-5 py-2 font-sans text-[14px] font-semibold text-ink shadow-card active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm"
        >
          use this →
        </button>
      </div>
    </div>
  );
}

function UploadingState({ url }: { url: string }) {
  return (
    <div className="mx-3.5">
      <div className="overflow-hidden rounded-[18px] border-2 border-ink shadow-card-lg">
        <img
          src={url}
          alt=""
          className="block max-h-[60vh] w-full object-contain bg-bg opacity-60"
        />
      </div>
      <p className="mt-5 text-center font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
        uploading…
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-rose-deep bg-rose/20 px-5 py-7 text-center">
      <p className="mb-2 font-serif text-[18px] italic text-ink">that didn't work.</p>
      <p className="mb-4 text-[13px] text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[12px] border-2 border-ink bg-surface px-4 py-2 font-sans text-[14px] font-semibold text-ink shadow-card-sm active:translate-x-[1px] active:translate-y-[1px]"
      >
        try again
      </button>
    </div>
  );
}
