import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import SketchCanvas from './SketchCanvas';
import {
  createSketch,
  deleteSketch,
  listSketches,
  updateSketch,
  type Sketch,
} from '../../lib/sketches';

interface Props {
  pageId: string;
}

/**
 * Always-on section on every page: a gallery of saved sketches plus a
 * "+ new sketch" affordance. Tap a thumbnail to view it full-screen.
 */
export default function SketchesSection({ pageId }: Props) {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [view, setView] = useState<Sketch | null>(null);
  const [editing, setEditing] = useState<Sketch | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listSketches(pageId);
      setSketches(rows);
    } catch {
      setSketches([]);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveNew(
    svg: string,
    w: number,
    h: number,
    template: 'blank' | 'dotted' | 'lined' | 'grid',
    raw: { strokes: any[]; text_boxes: any[]; next_id: number },
  ) {
    await createSketch({
      page_id: pageId,
      svg,
      w,
      h,
      template,
      strokes: raw.strokes,
      text_boxes: raw.text_boxes,
      next_id: raw.next_id,
    });
    await load();
  }

  async function onSaveEdit(
    svg: string,
    w: number,
    h: number,
    template: 'blank' | 'dotted' | 'lined' | 'grid',
    raw: { strokes: any[]; text_boxes: any[]; next_id: number },
  ) {
    if (!editing) return;
    await updateSketch(editing.id, {
      svg,
      w,
      h,
      template,
      strokes: raw.strokes,
      text_boxes: raw.text_boxes,
      next_id: raw.next_id,
    });
    setEditing(null);
    await load();
  }

  async function onRemove(id: string) {
    if (!window.confirm('delete this sketch?')) return;
    setSketches((cur) => cur.filter((s) => s.id !== id));
    setView(null);
    try {
      await deleteSketch(id);
    } catch {
      void load();
    }
  }

  // collapse the section if loading + empty (avoids a flicker)
  if (loading && sketches.length === 0) return null;

  return (
    <div className="surface-card mx-3.5 mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-bg-soft px-3.5 py-2.5">
        <h3 className="flex items-center gap-2 font-mono text-[14px] uppercase tracking-mono-wide">
          <span>✎</span> sketches
        </h3>
        <button
          onClick={() => setCanvasOpen(true)}
          className="rounded-pill border-[1.5px] border-ink bg-surface px-2.5 py-1 font-mono text-[11px] uppercase tracking-mono shadow-card-sm hover:bg-bg"
        >
          + new sketch
        </button>
      </div>
      <div className="px-3.5 py-3">
        {sketches.length === 0 ? (
          <p className="text-[13px] italic text-ink-soft">
            tap <em>+ new sketch</em> to write or draw — best on iPad with apple pencil.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sketches.map((s) => (
              <SketchThumb
                key={s.id}
                sketch={s}
                onTap={() => setView(s)}
              />
            ))}
          </div>
        )}
      </div>

      <SketchCanvas
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        onSave={onSaveNew}
      />
      <SketchCanvas
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={
          editing
            ? {
                strokes: editing.payload?.strokes,
                text_boxes: editing.payload?.text_boxes,
                template: editing.payload?.template,
                next_id: editing.payload?.next_id,
              }
            : undefined
        }
        onSave={onSaveEdit}
      />

      {view && (
        <SketchViewer
          sketch={view}
          onClose={() => setView(null)}
          onDelete={() => onRemove(view.id)}
          onEdit={
            view.payload?.strokes || view.payload?.text_boxes
              ? () => {
                  setEditing(view);
                  setView(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function SketchThumb({ sketch, onTap }: { sketch: Sketch; onTap: () => void }) {
  const w = sketch.payload?.w ?? 320;
  const h = sketch.payload?.h ?? 240;
  return (
    <button
      onClick={onTap}
      className="group relative overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-surface shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
    >
      <div
        className="aspect-[4/3] w-full bg-bg-soft"
        // svg is a string we control (no user-uploaded markup); also no <script>
        // is ever emitted by SketchCanvas.
        dangerouslySetInnerHTML={{ __html: scaledSvg(sketch.payload?.svg ?? '', w, h) }}
      />
      <div className="border-t border-dashed border-ink/30 bg-bg-soft px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
        {format(new Date(sketch.created_at), 'd MMM h:mma').toLowerCase()}
      </div>
    </button>
  );
}

function SketchViewer({
  sketch,
  onClose,
  onDelete,
  onEdit,
}: {
  sketch: Sketch;
  onClose: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  const w = sketch.payload?.w ?? 320;
  const h = sketch.payload?.h ?? 240;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/70 p-6 backdrop-blur-md animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[800px] flex-col overflow-hidden rounded-[16px] border-[2.5px] border-ink bg-surface shadow-card-lg"
      >
        <div className="flex items-center justify-between border-b-2 border-ink bg-bg-soft px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {format(new Date(sketch.created_at), 'EEE d MMM · h:mma').toLowerCase()}
          </span>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded-md border border-ink bg-peach px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink"
              >
                ✎ edit
              </button>
            )}
            <button
              onClick={onDelete}
              className="rounded-md border border-rose-deep bg-rose/30 px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink"
            >
              ✕ delete
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-ink bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-mono"
            >
              close
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-auto bg-bg p-4"
          dangerouslySetInnerHTML={{ __html: scaledSvg(sketch.payload?.svg ?? '', w, h, '100%') }}
        />
      </div>
    </div>
  );
}

/** Adds width=100% / responsive sizing to the stored svg string. */
function scaledSvg(raw: string, w: number, h: number, width = '100%'): string {
  if (!raw) return '';
  // re-set width/height attrs so the svg scales to its container
  return raw
    .replace(/<svg([^>]*)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*)\sheight="[^"]*"/, '<svg$1')
    .replace(
      '<svg',
      `<svg preserveAspectRatio="xMidYMid meet" width="${width}" height="100%" style="display:block;max-width:100%;" viewBox="0 0 ${w} ${h}"`,
    )
    // remove duplicate viewBox if it was in the original
    .replace(/(viewBox="0 0 [\d.]+ [\d.]+")(.*viewBox="0 0 [\d.]+ [\d.]+")/g, '$1');
}
