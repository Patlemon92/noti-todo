import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getStroke } from 'perfect-freehand';
import clsx from 'clsx';
import type { PaperTemplate } from '../../lib/sketches';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: {
    strokes?: Stroke[];
    text_boxes?: TextBox[];
    template?: PaperTemplate;
    next_id?: number;
  };
  onSave: (
    svg: string,
    w: number,
    h: number,
    template: PaperTemplate,
    raw: { strokes: Stroke[]; text_boxes: TextBox[]; next_id: number },
  ) => Promise<void> | void;
}

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text';
type Pt = [number, number, number]; // x, y, pressure
type Stroke = {
  id: number;
  points: Pt[];
  color: string;
  size: number;
  tool: 'pen' | 'highlighter';
};
type TextBox = {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
};

const PEN_COLORS = ['#2a2520', '#e88562', '#7fb389', '#8db4c8', '#a896d4', '#e8c75f'];
const HIGHLIGHTER_COLORS = ['#fbeb5b', '#a3e3a3', '#9dc6e8', '#f4a3a3', '#e3b8f5', '#ffb37b'];
const TEXT_COLORS = PEN_COLORS;
const PEN_SIZES = [2, 4, 7, 12];
const HIGHLIGHTER_SIZES = [14, 22, 32];
const TEXT_SIZES = [14, 18, 24, 32];

const TEMPLATES: Array<{ key: PaperTemplate; label: string }> = [
  { key: 'blank', label: 'blank' },
  { key: 'dotted', label: 'dots' },
  { key: 'lined', label: 'lines' },
  { key: 'grid', label: 'grid' },
];

// ============================================================================
// component
// ============================================================================
export default function SketchCanvas({ open, onClose, onSave, initial }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [editingTextId, setEditingTextId] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState<string>('#2a2520');
  const [penSize, setPenSize] = useState<number>(4);
  const [hlColor, setHlColor] = useState<string>('#fbeb5b');
  const [hlSize, setHlSize] = useState<number>(22);
  const [textColor, setTextColor] = useState<string>('#2a2520');
  const [textSize, setTextSize] = useState<number>(18);
  const [template, setTemplate] = useState<PaperTemplate>('dotted');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const nextId = useRef(1);
  // remember the initial data we hydrated with so the reset-on-open
  // effect doesn't reload it after every save.
  const hydratedRef = useRef(false);

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

  // esc to close, cmd/ctrl+z undo
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

  // reset / hydrate state when reopened
  useEffect(() => {
    if (open) {
      setStrokes(initial?.strokes ?? []);
      setTextBoxes(initial?.text_boxes ?? []);
      setTemplate(initial?.template ?? 'dotted');
      setCurrent(null);
      setEditingTextId(null);
      setShowTemplatePicker(false);
      nextId.current = initial?.next_id ?? 1;
      hydratedRef.current = true;
    } else {
      hydratedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function relPoint(e: ReactPointerEvent<HTMLDivElement>): Pt {
    const r = surfaceRef.current!.getBoundingClientRect();
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  }

  function eraseAt(p: [number, number]) {
    // text boxes first (they're rendered as DOM, easier to remove)
    setTextBoxes((cur) => {
      for (let i = cur.length - 1; i >= 0; i--) {
        const b = cur[i];
        const tw = Math.max(40, b.text.length * b.size * 0.55);
        const th = (b.text.split('\n').length || 1) * b.size * 1.3;
        if (p[0] >= b.x && p[0] <= b.x + tw && p[1] >= b.y && p[1] <= b.y + th) {
          return cur.filter((_, idx) => idx !== i);
        }
      }
      return cur;
    });
    setStrokes((cur) => {
      for (let i = cur.length - 1; i >= 0; i--) {
        const s = cur[i];
        const hitRadius = (s.size + 14) * (s.size + 14);
        for (const pt of s.points) {
          const dx = pt[0] - p[0];
          const dy = pt[1] - p[1];
          if (dx * dx + dy * dy <= hitRadius) {
            return cur.filter((_, idx) => idx !== i);
          }
        }
      }
      return cur;
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (tool === 'eraser') {
      const r = surfaceRef.current!.getBoundingClientRect();
      eraseAt([e.clientX - r.left, e.clientY - r.top]);
      return;
    }

    if (tool === 'text') {
      // tap an empty spot to drop a new text box
      const r = surfaceRef.current!.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const id = nextId.current++;
      setTextBoxes((cur) => [
        ...cur,
        { id, x, y, text: '', color: textColor, size: textSize },
      ]);
      setEditingTextId(id);
      return;
    }

    const isHl = tool === 'highlighter';
    setCurrent({
      id: nextId.current++,
      points: [relPoint(e)],
      color: isHl ? hlColor : penColor,
      size: isHl ? hlSize : penSize,
      tool: isHl ? 'highlighter' : 'pen',
    });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'eraser') {
      if (e.buttons === 0 && e.pointerType !== 'pen') return;
      const r = surfaceRef.current!.getBoundingClientRect();
      eraseAt([e.clientX - r.left, e.clientY - r.top]);
      return;
    }
    if (tool === 'text') return;
    if (!current) return;
    if (e.buttons === 0 && e.pointerType !== 'pen') return;
    setCurrent((c) => (c ? { ...c, points: [...c.points, relPoint(e)] } : c));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (tool === 'eraser' || tool === 'text') return;
    if (!current) return;
    if (current.points.length > 1) setStrokes((s) => [...s, current]);
    setCurrent(null);
  }

  function undo() {
    // undo the most recent action — either a stroke or a text box, whichever
    // was added last. we don't track an explicit history so use timestamps via
    // their position in the arrays + the rough heuristic that strokes are
    // append-only.
    if (textBoxes.length > 0 && strokes.length === 0) {
      setTextBoxes((b) => b.slice(0, -1));
      return;
    }
    if (strokes.length > 0 && textBoxes.length === 0) {
      setStrokes((s) => s.slice(0, -1));
      return;
    }
    if (strokes.length > 0) {
      setStrokes((s) => s.slice(0, -1));
    } else if (textBoxes.length > 0) {
      setTextBoxes((b) => b.slice(0, -1));
    }
  }

  function clear() {
    setStrokes([]);
    setTextBoxes([]);
    setCurrent(null);
    setEditingTextId(null);
  }

  const allStrokes = current ? [...strokes, current] : strokes;
  // highlighter renders behind pen so ink stays on top
  const sortedStrokes = [...allStrokes].sort((a, b) => {
    if (a.tool === b.tool) return 0;
    return a.tool === 'highlighter' ? -1 : 1;
  });
  const isEmpty =
    strokes.length === 0 &&
    !current &&
    textBoxes.filter((b) => b.text.trim()).length === 0;

  const buildSvg = useCallback((): string => {
    const bg = buildPaperBgSvg(template, dims.w, dims.h);
    const sorted = [...strokes].sort((a, b) => (a.tool === b.tool ? 0 : a.tool === 'highlighter' ? -1 : 1));
    const paths = sorted
      .map((s) => {
        const d = svgPathFromStroke(s.points, s.size);
        if (!d) return '';
        const opacity = s.tool === 'highlighter' ? 0.4 : 1;
        return `<path d="${d}" fill="${s.color}" opacity="${opacity}" />`;
      })
      .filter(Boolean)
      .join('');
    const texts = textBoxes
      .filter((b) => b.text.trim())
      .map((b) => {
        const lines = b.text.split('\n');
        return lines
          .map((line, i) => {
            const baseline = b.y + b.size * 0.95 + i * b.size * 1.25;
            return `<text x="${b.x.toFixed(2)}" y="${baseline.toFixed(2)}" font-family="'Bricolage Grotesque', sans-serif" font-size="${b.size}" fill="${b.color}">${escapeXml(line)}</text>`;
          })
          .join('');
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}">${bg}${paths}${texts}</svg>`;
  }, [strokes, textBoxes, dims, template]);

  async function handleSave() {
    if (isEmpty || saving) return;
    setSaving(true);
    try {
      await onSave(buildSvg(), dims.w, dims.h, template, {
        strokes,
        text_boxes: textBoxes,
        next_id: nextId.current,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const activeColor =
    tool === 'highlighter' ? hlColor : tool === 'text' ? textColor : penColor;
  const activeColors =
    tool === 'highlighter' ? HIGHLIGHTER_COLORS : tool === 'text' ? TEXT_COLORS : PEN_COLORS;
  const activeSize =
    tool === 'highlighter' ? hlSize : tool === 'text' ? textSize : penSize;
  const activeSizes =
    tool === 'highlighter' ? HIGHLIGHTER_SIZES : tool === 'text' ? TEXT_SIZES : PEN_SIZES;
  function setActiveColor(c: string) {
    if (tool === 'highlighter') setHlColor(c);
    else if (tool === 'text') setTextColor(c);
    else setPenColor(c);
  }
  function setActiveSize(s: number) {
    if (tool === 'highlighter') setHlSize(s);
    else if (tool === 'text') setTextSize(s);
    else setPenSize(s);
  }

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-bg animate-fadeIn">
      {/* top bar */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-bg-soft px-3 py-2">
        <button
          onClick={onClose}
          className="rounded-pill border-2 border-ink bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-mono shadow-card-sm"
        >
          ← cancel
        </button>

        {/* tool selector */}
        <div className="flex items-center gap-1 rounded-pill border-2 border-ink bg-surface p-1 shadow-card-sm">
          <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} label="pen">
            ✎
          </ToolBtn>
          <ToolBtn
            active={tool === 'highlighter'}
            onClick={() => setTool('highlighter')}
            label="highlighter"
          >
            ▮
          </ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} label="eraser">
            ◌
          </ToolBtn>
          <ToolBtn active={tool === 'text'} onClick={() => setTool('text')} label="text">
            T
          </ToolBtn>
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
        className={clsx(
          'relative flex-1 touch-none overflow-hidden bg-surface',
          tool === 'eraser' && 'cursor-crosshair',
        )}
        style={paperBgStyle(template)}
      >
        <svg
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          width={dims.w}
          height={dims.h}
          className="pointer-events-none absolute inset-0"
        >
          {sortedStrokes.map((s) => {
            const d = svgPathFromStroke(s.points, s.size);
            if (!d) return null;
            return (
              <path
                key={s.id}
                d={d}
                fill={s.color}
                opacity={s.tool === 'highlighter' ? 0.4 : 1}
              />
            );
          })}
        </svg>

        {/* live text boxes — interactive only when text tool is active */}
        {textBoxes.map((b) => (
          <textarea
            key={b.id}
            value={b.text}
            autoFocus={editingTextId === b.id}
            onChange={(e) =>
              setTextBoxes((cur) =>
                cur.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)),
              )
            }
            onBlur={() => setEditingTextId((id) => (id === b.id ? null : id))}
            onFocus={() => setEditingTextId(b.id)}
            onClick={(e) => {
              if (tool === 'text') {
                e.stopPropagation();
                setEditingTextId(b.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            }}
            placeholder={editingTextId === b.id ? 'type…' : ''}
            spellCheck={false}
            className={clsx(
              'absolute resize-none bg-transparent leading-snug outline-none',
              tool === 'text' ? 'pointer-events-auto' : 'pointer-events-none',
              editingTextId === b.id && 'rounded border border-dashed border-ink/40',
            )}
            style={{
              left: b.x,
              top: b.y,
              color: b.color,
              fontSize: b.size,
              fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
              minWidth: '40px',
              minHeight: `${b.size * 1.4}px`,
              padding: '0 2px',
              caretColor: b.color,
            }}
            // auto-grow width to roughly fit content
            cols={Math.max(8, b.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) + 1)}
            rows={Math.max(1, b.text.split('\n').length)}
          />
        ))}

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-serif text-[20px] italic text-ink-faint">
              {tool === 'text' ? 'tap to add text' : 'draw with finger or apple pencil'}
            </p>
          </div>
        )}
      </div>

      {/* bottom toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-ink bg-bg-soft px-3 py-2">
        {/* colors — hidden for eraser */}
        {tool !== 'eraser' ? (
          <div className="flex items-center gap-1.5">
            {activeColors.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                aria-label={`color ${c}`}
                className={clsx(
                  'h-7 w-7 rounded-full border-2 transition-transform',
                  activeColor === c ? 'border-ink scale-110' : 'border-ink/30',
                )}
                style={{
                  background: c,
                  opacity: tool === 'highlighter' ? 0.65 : 1,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            drag through ink or text to erase
          </div>
        )}

        {/* sizes — hidden for eraser */}
        {tool !== 'eraser' && (
          <div className="flex items-center gap-1.5">
            {activeSizes.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSize(s)}
                aria-label={`size ${s}`}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2',
                  activeSize === s ? 'border-ink bg-bg' : 'border-ink/30',
                )}
              >
                {tool === 'text' ? (
                  <span
                    className="font-serif font-semibold leading-none"
                    style={{ color: activeColor, fontSize: Math.min(s, 16) }}
                  >
                    T
                  </span>
                ) : (
                  <span
                    className="block rounded-full"
                    style={{
                      width: Math.min(s + 2, 18),
                      height: Math.min(s + 2, 18),
                      background:
                        tool === 'highlighter' ? `${activeColor}66` : activeColor,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* paper template + undo + clear */}
        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="rounded-md border border-ink bg-surface px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-mono"
          >
            {currentTemplateLabel(template)} ▾
          </button>
          {showTemplatePicker && (
            <div className="absolute bottom-full right-0 z-10 mb-2 flex flex-col gap-1 rounded-[10px] border-2 border-ink bg-surface p-1.5 shadow-card-sm">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTemplate(t.key);
                    setShowTemplatePicker(false);
                  }}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-left font-mono text-[11px] uppercase tracking-mono',
                    template === t.key ? 'bg-peach text-ink' : 'hover:bg-bg-soft',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
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
// helpers
// ============================================================================
function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'flex h-9 w-9 items-center justify-center rounded-full font-mono text-[16px] transition-colors',
        active ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function currentTemplateLabel(t: PaperTemplate): string {
  return TEMPLATES.find((x) => x.key === t)?.label ?? 'blank';
}

/** CSS background-image for the live editing surface (matches the saved svg). */
function paperBgStyle(template: PaperTemplate): React.CSSProperties {
  const ink = 'rgba(42,37,32,0.22)';
  const inkLine = 'rgba(42,37,32,0.18)';
  switch (template) {
    case 'dotted':
      return {
        backgroundImage: `radial-gradient(circle at 1px 1px, ${ink} 1px, transparent 0)`,
        backgroundSize: '22px 22px',
      };
    case 'lined':
      return {
        backgroundImage: `linear-gradient(to bottom, transparent 27px, ${inkLine} 28px, transparent 28px)`,
        backgroundSize: '100% 28px',
      };
    case 'grid':
      return {
        backgroundImage: `linear-gradient(to right, ${inkLine} 1px, transparent 1px), linear-gradient(to bottom, ${inkLine} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      };
    default:
      return {};
  }
}

/** SVG fragment for the paper background, embedded into saved sketches. */
function buildPaperBgSvg(template: PaperTemplate, w: number, h: number): string {
  if (template === 'blank') return '';
  if (template === 'dotted') {
    return `<defs><pattern id="bgDots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(42,37,32,0.22)"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgDots)"/>`;
  }
  if (template === 'lined') {
    return `<defs><pattern id="bgLines" width="${w}" height="28" patternUnits="userSpaceOnUse"><line x1="0" y1="28" x2="${w}" y2="28" stroke="rgba(42,37,32,0.18)" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgLines)"/>`;
  }
  if (template === 'grid') {
    return `<defs><pattern id="bgGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(42,37,32,0.18)" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgGrid)"/>`;
  }
  return '';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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
