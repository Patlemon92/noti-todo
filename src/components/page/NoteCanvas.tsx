// Inline canvas for notes. Auto-saves on every change with a 600ms debounce.
// Tools: pen / highlighter / eraser / text + paper templates.
// Persists to page.properties.canvas (raw stroke + text-box data plus a
// pre-rendered svg for preview thumbnails).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getStroke } from 'perfect-freehand';
import clsx from 'clsx';
import type {
  CanvasStroke as Stroke,
  CanvasTextBox as TextBox,
  NoteCanvasData,
} from '../../lib/types';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text';
type Template = 'blank' | 'dotted' | 'lined' | 'grid';
type Pt = [number, number, number];

const PEN_COLORS = ['#2a2520', '#e88562', '#7fb389', '#8db4c8', '#a896d4', '#e8c75f'];
const HL_COLORS = ['#fbeb5b', '#a3e3a3', '#9dc6e8', '#f4a3a3', '#e3b8f5', '#ffb37b'];
const TEXT_COLORS = PEN_COLORS;
const PEN_SIZES = [2, 4, 7, 12];
const HL_SIZES = [14, 22, 32];
const TEXT_SIZES = [14, 18, 24, 32];

const TEMPLATES: Array<{ key: Template; label: string }> = [
  { key: 'blank', label: 'blank' },
  { key: 'dotted', label: 'dots' },
  { key: 'lined', label: 'lines' },
  { key: 'grid', label: 'grid' },
];

interface Props {
  initial?: NoteCanvasData;
  onSave: (data: NoteCanvasData) => Promise<void> | void;
}

export default function NoteCanvas({ initial, onSave }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial?.strokes ?? []);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>(initial?.text_boxes ?? []);
  const [template, setTemplate] = useState<Template>(initial?.template ?? 'dotted');
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [editingTextId, setEditingTextId] = useState<number | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState('#2a2520');
  const [penSize, setPenSize] = useState(4);
  const [hlColor, setHlColor] = useState('#fbeb5b');
  const [hlSize, setHlSize] = useState(22);
  const [textColor, setTextColor] = useState('#2a2520');
  const [textSize, setTextSize] = useState(18);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: initial?.w ?? 0, h: initial?.h ?? 0 });
  const nextIdRef = useRef<number>(initial?.next_id ?? 1);

  // measure
  useEffect(() => {
    function measure() {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (r) setDims({ w: r.width, h: r.height });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ----- auto-save (debounced) -----
  const saveTimer = useRef<number | null>(null);
  const lastSerialized = useRef<string>('');
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const buildSvg = useCallback((): string => {
    if (dims.w === 0) return '';
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
  }, [strokes, textBoxes, template, dims]);

  useEffect(() => {
    // skip the very first render after hydrating (initial load shouldn't
    // trigger a save)
    const data: NoteCanvasData = {
      strokes,
      text_boxes: textBoxes,
      template,
      w: dims.w,
      h: dims.h,
      svg: buildSvg(),
      next_id: nextIdRef.current,
    };
    const serialized = JSON.stringify(data);
    if (lastSerialized.current === '') {
      lastSerialized.current = serialized;
      return;
    }
    if (serialized === lastSerialized.current) return;

    setSaveStatus('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await onSaveRef.current(data);
        lastSerialized.current = serialized;
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1200);
      } catch {
        setSaveStatus('idle');
      }
    }, 600);
  }, [strokes, textBoxes, template, dims, buildSvg]);

  // ----- pointer handlers -----
  function relPoint(e: ReactPointerEvent<HTMLDivElement>): Pt {
    const r = surfaceRef.current!.getBoundingClientRect();
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  }

  function eraseAt(p: [number, number]) {
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
        const hit = (s.size + 14) * (s.size + 14);
        for (const pt of s.points) {
          const dx = pt[0] - p[0];
          const dy = pt[1] - p[1];
          if (dx * dx + dy * dy <= hit) return cur.filter((_, idx) => idx !== i);
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
      const r = surfaceRef.current!.getBoundingClientRect();
      const id = nextIdRef.current++;
      setTextBoxes((cur) => [
        ...cur,
        {
          id,
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          text: '',
          color: textColor,
          size: textSize,
        },
      ]);
      setEditingTextId(id);
      return;
    }

    const isHl = tool === 'highlighter';
    setCurrent({
      id: nextIdRef.current++,
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
    if (strokes.length > 0) setStrokes((s) => s.slice(0, -1));
    else if (textBoxes.length > 0) setTextBoxes((b) => b.slice(0, -1));
  }
  function clearAll() {
    if (!window.confirm('clear the whole canvas?')) return;
    setStrokes([]);
    setTextBoxes([]);
    setCurrent(null);
    setEditingTextId(null);
  }

  // ----- derived -----
  const allStrokes = current ? [...strokes, current] : strokes;
  const sortedStrokes = useMemo(
    () =>
      [...allStrokes].sort((a, b) =>
        a.tool === b.tool ? 0 : a.tool === 'highlighter' ? -1 : 1,
      ),
    [allStrokes],
  );

  const activeColor =
    tool === 'highlighter' ? hlColor : tool === 'text' ? textColor : penColor;
  const activeColors =
    tool === 'highlighter' ? HL_COLORS : tool === 'text' ? TEXT_COLORS : PEN_COLORS;
  const activeSize =
    tool === 'highlighter' ? hlSize : tool === 'text' ? textSize : penSize;
  const activeSizes =
    tool === 'highlighter' ? HL_SIZES : tool === 'text' ? TEXT_SIZES : PEN_SIZES;
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
    <div className="mx-3.5 mb-4 overflow-hidden rounded-[14px] border-2 border-ink bg-surface shadow-card">
      {/* tool palette */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-bg-soft px-2.5 py-2">
        {/* tools */}
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

        {/* colors */}
        {tool !== 'eraser' && (
          <div className="flex items-center gap-1">
            {activeColors.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                aria-label={`color ${c}`}
                className={clsx(
                  'h-6 w-6 rounded-full border-2 transition-transform',
                  activeColor === c ? 'border-ink scale-110' : 'border-ink/30',
                )}
                style={{
                  background: c,
                  opacity: tool === 'highlighter' ? 0.65 : 1,
                }}
              />
            ))}
          </div>
        )}

        {/* sizes */}
        {tool !== 'eraser' && (
          <div className="flex items-center gap-1">
            {activeSizes.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSize(s)}
                aria-label={`size ${s}`}
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2',
                  activeSize === s ? 'border-ink bg-bg' : 'border-ink/30',
                )}
              >
                {tool === 'text' ? (
                  <span
                    className="font-serif font-semibold leading-none"
                    style={{ color: activeColor, fontSize: Math.min(s, 14) }}
                  >
                    T
                  </span>
                ) : (
                  <span
                    className="block rounded-full"
                    style={{
                      width: Math.min(s + 2, 14),
                      height: Math.min(s + 2, 14),
                      background:
                        tool === 'highlighter' ? `${activeColor}66` : activeColor,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* paper / undo / clear / saving */}
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="rounded-md border border-ink bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-mono"
          >
            {TEMPLATES.find((t) => t.key === template)?.label} ▾
          </button>
          {showTemplatePicker && (
            <div className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-[10px] border-2 border-ink bg-surface p-1.5 shadow-card-sm">
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
            disabled={strokes.length === 0 && textBoxes.length === 0}
            className="rounded-md border border-ink bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-mono disabled:opacity-40"
          >
            ↶
          </button>
          <button
            onClick={clearAll}
            disabled={strokes.length === 0 && textBoxes.length === 0}
            className="rounded-md border border-ink bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-mono disabled:opacity-40"
          >
            clear
          </button>
          <span
            className={clsx(
              'min-w-[42px] text-center font-mono text-[10px] uppercase tracking-mono transition-opacity',
              saveStatus === 'idle' && 'opacity-0',
              saveStatus === 'saving' && 'text-ink-soft',
              saveStatus === 'saved' && 'text-mint-deep',
            )}
          >
            {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? 'saved' : ''}
          </span>
        </div>
      </div>

      {/* canvas surface */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={clsx(
          'relative h-[min(70vh,720px)] touch-none overflow-hidden bg-surface',
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
            cols={Math.max(8, b.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) + 1)}
            rows={Math.max(1, b.text.split('\n').length)}
          />
        ))}

        {strokes.length === 0 && textBoxes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-serif text-[18px] italic text-ink-faint">
              {tool === 'text'
                ? 'tap to add text'
                : 'write or draw — pen for ink, T for text'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// helpers (shared with SketchCanvas conceptually — duplicated for now)
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
        'flex h-8 w-8 items-center justify-center rounded-full font-mono text-[14px] transition-colors',
        active ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function paperBgStyle(template: Template): React.CSSProperties {
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

function buildPaperBgSvg(template: Template, w: number, h: number): string {
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
