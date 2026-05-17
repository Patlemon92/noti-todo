import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getStroke } from 'perfect-freehand';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (svg: string, w: number, h: number) => Promise<void> | void;
}

type Pt = [number, number, number]; // x, y, pressure
type Stroke = { points: Pt[]; color: string; size: number };

const COLORS = ['#2a2520', '#e88562', '#7fb389', '#8db4c8', '#a896d4', '#e8c75f'];
const SIZES = [2, 4, 7, 12];

/** Full-screen ink canvas. Uses perfect-freehand for pressure-aware strokes. */
export default function SketchCanvas({ open, onClose, onSave }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState<string>('#2a2520');
  const [size, setSize] = useState<number>(4);
  const [saving, setSaving] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // measure canvas size
  useEffect(() => {
    if (!open) return;
    function measure() {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (r) setDims({ w: r.width, h: r.height });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // esc closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // reset when opened
  useEffect(() => {
    if (open) {
      setStrokes([]);
      setCurrent(null);
    }
  }, [open]);

  function relPoint(e: ReactPointerEvent<HTMLDivElement>): Pt {
    const r = surfaceRef.current!.getBoundingClientRect();
    // Apple Pencil reports pressure 0–1. Mouse/finger default to 0.5 if no
    // pressure data so strokes stay visible.
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // ignore non-primary pointers and palm rejection on iPad
    if (e.button !== 0 && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setCurrent({ points: [relPoint(e)], color, size });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!current) return;
    if (e.buttons === 0 && e.pointerType !== 'pen') return;
    setCurrent((c) => (c ? { ...c, points: [...c.points, relPoint(e)] } : c));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!current) return;
    if (current.points.length > 1) {
      setStrokes((s) => [...s, current]);
    }
    setCurrent(null);
  }

  function undo() {
    setStrokes((s) => s.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
    setCurrent(null);
  }

  const allStrokes = current ? [...strokes, current] : strokes;
  const isEmpty = strokes.length === 0 && !current;

  const buildSvg = useCallback((): string => {
    const paths = strokes
      .map((s) => {
        const d = svgPathFromStroke(s.points, s.size);
        if (!d) return '';
        return `<path d="${d}" fill="${s.color}" />`;
      })
      .filter(Boolean)
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}">${paths}</svg>`;
  }, [strokes, dims]);

  async function handleSave() {
    if (isEmpty || saving) return;
    setSaving(true);
    try {
      await onSave(buildSvg(), dims.w, dims.h);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-bg animate-fadeIn">
      {/* top bar */}
      <div className="flex items-center justify-between border-b-2 border-ink bg-bg-soft px-3 py-2">
        <button
          onClick={onClose}
          className="rounded-pill border-2 border-ink bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-mono shadow-card-sm"
        >
          ← cancel
        </button>
        <div className="font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
          sketch
        </div>
        <button
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="rounded-pill border-2 border-ink bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-mono text-bg shadow-coral disabled:opacity-50"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>

      {/* canvas surface */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative flex-1 touch-none overflow-hidden bg-bg bg-dots bg-dots"
        style={{ backgroundSize: '22px 22px' }}
      >
        <svg
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          width={dims.w}
          height={dims.h}
          className="pointer-events-none absolute inset-0"
        >
          {allStrokes.map((s, i) => {
            const d = svgPathFromStroke(s.points, s.size);
            if (!d) return null;
            return <path key={i} d={d} fill={s.color} />;
          })}
        </svg>
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-serif text-[20px] italic text-ink-faint">
              draw with finger or apple pencil
            </p>
          </div>
        )}
      </div>

      {/* tool row */}
      <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-bg-soft px-3 py-2">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={clsx(
                'h-7 w-7 rounded-full border-2 transition-transform',
                color === c ? 'border-ink scale-110' : 'border-ink/30',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              aria-label={`size ${s}`}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full border-2',
                size === s ? 'border-ink bg-bg' : 'border-ink/30',
              )}
            >
              <span
                className="block rounded-full bg-ink"
                style={{ width: s + 2, height: s + 2 }}
              />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={undo}
            disabled={strokes.length === 0}
            className="rounded-md border border-ink bg-surface px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-mono disabled:opacity-40"
          >
            ↶ undo
          </button>
          <button
            onClick={clear}
            disabled={isEmpty}
            className="rounded-md border border-ink bg-surface px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-mono disabled:opacity-40"
          >
            clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// stroke → svg path
// ============================================================================
function svgPathFromStroke(points: Pt[], size: number): string {
  if (points.length < 2) return '';
  const stroke = getStroke(points, {
    size,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
    last: true,
  });
  if (stroke.length === 0) return '';
  let d = '';
  for (let i = 0; i < stroke.length; i++) {
    const [x, y] = stroke[i];
    d += i === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)} ` : `L${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  d += 'Z';
  return d;
}
