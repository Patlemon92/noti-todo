import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';

import {
  createPhoto,
  deletePhoto,
  listPhotos,
  type Photo,
} from '../../lib/photos';

interface Props {
  pageId: string;
  /** Triggered by the parent (action pill) to open the file picker. */
  openSignal?: number;
}

/**
 * Photos gallery for task pages — driven by `+ add image` action pill.
 * Stores photos as page_actions type='image' with base64 payload.
 */
export default function PhotosSection({ pageId, openSignal = 0 }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<Photo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSignal = useRef(0);

  const load = useCallback(async () => {
    try {
      const rows = await listPhotos(pageId);
      setPhotos(rows);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  // open file picker when the parent signals via openSignal
  useEffect(() => {
    if (openSignal !== lastSignal.current && openSignal > 0) {
      lastSignal.current = openSignal;
      inputRef.current?.click();
    }
  }, [openSignal]);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = async () => {
        // cap longest side at 1200 for storage
        const max = 1200;
        const ratio = img.width > img.height ? max / img.width : max / img.height;
        const w = Math.min(img.width, Math.round(img.width * ratio));
        const h = Math.min(img.height, Math.round(img.height * ratio));
        try {
          await createPhoto({ page_id: pageId, src: dataUrl, w, h });
          await load();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[photo upload]', err);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function onRemove(p: Photo) {
    if (!window.confirm('delete this photo?')) return;
    setPhotos((cur) => cur.filter((x) => x.id !== p.id));
    setView(null);
    try {
      await deletePhoto(p.id);
    } catch {
      void load();
    }
  }

  // hide the section entirely if no photos and not loading
  if (loading && photos.length === 0) {
    return (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        className="hidden"
      />
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        className="hidden"
      />
      {photos.length > 0 && (
        <div className="surface-card mx-3.5 mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-bg-soft px-3.5 py-2.5">
            <h3 className="flex items-center gap-2 font-mono text-[14px] uppercase tracking-mono-wide">
              <CameraIcon /> photos
            </h3>
            <span className="font-mono text-[12px] text-ink-soft">
              {photos.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <button
                key={p.id}
                onClick={() => setView(p)}
                className="aspect-square overflow-hidden rounded-[8px] border border-ink/20 bg-bg-soft transition-transform active:translate-x-[1px] active:translate-y-[1px]"
              >
                <img
                  src={p.payload?.src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {view && (
        <div
          onClick={() => setView(null)}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/80 p-4 backdrop-blur-md animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              'flex max-h-[90vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-surface shadow-card-lg',
            )}
          >
            <div className="flex items-center justify-between border-b-2 border-ink bg-bg-soft px-3 py-2">
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                {format(new Date(view.created_at), 'EEE d MMM · h:mma').toLowerCase()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onRemove(view)}
                  className="rounded-md border border-rose-deep bg-rose/30 px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink"
                >
                  ✕ delete
                </button>
                <button
                  onClick={() => setView(null)}
                  className="rounded-md border border-ink bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-mono"
                >
                  close
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-bg p-4">
              <img
                src={view.payload?.src}
                alt=""
                className="max-h-[80vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Small, hand-drawn-style camera. Matches design system stroke weight. */
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7l1.3-2.2h4.4L15.5 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}
