// Multi-page notebook surface. Each page is one paper sheet with a flowing
// textarea (auto-grows with content) and an ink overlay (pen / highlighter
// strokes positioned by pointer coords). Tools are global, shared across all
// pages. + add page below the last one.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getStroke } from 'perfect-freehand';
import clsx from 'clsx';
import type {
  CanvasStroke as Stroke,
  CanvasTextBox,
  NoteCanvasData,
  NotePage,
} from '../../lib/types';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text';
type Template = 'blank' | 'dotted' | 'lined' | 'grid';
type Pt = [number, number, number];

const PEN_COLORS = ['#2a2520', '#e88562', '#7fb389', '#8db4c8', '#a896d4', '#e8c75f'];
const HL_COLORS = ['#fbeb5b', '#a3e3a3', '#9dc6e8', '#f4a3a3', '#e3b8f5', '#ffb37b'];
const PEN_SIZES = [2, 4, 7, 12];
const HL_SIZES = [14, 22, 32];

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

// ============================================================================
// migration helpers
// ============================================================================
function hydratePages(initial?: NoteCanvasData): NotePage[] {
  if (initial?.pages && initial.pages.length > 0) return initial.pages;
  // legacy single-page hydration: stitch any text_boxes into one flowing text
  if (initial && (initial.strokes || initial.text_boxes)) {
    const text =
      (initial.text_boxes ?? [])
        .filter((b) => b.text && b.text.trim())
        .map((b: CanvasTextBox) => b.text)
        .join('\n\n')
        .trim();
    return [
      {
        id: 1,
        text,
        strokes: initial.strokes ?? [],
        template: initial.template ?? 'lined',
        w: initial.w,
        h: initial.h,
      },
    ];
  }
  // fresh: one empty page
  return [{ id: 1, text: '', strokes: [], template: 'lined' }];
}

// ============================================================================
// component
// ============================================================================
export default function NoteCanvas({ initial, onSave }: Props) {
  const [pages, setPages] = useState<NotePage[]>(() => hydratePages(initial));

  const [tool, setTool] = useState<Tool>('text');
  const [penColor, setPenColor] = useState('#2a2520');
  const [penSize, setPenSize] = useState(4);
  const [hlColor, setHlColor] = useState('#fbeb5b');
  const [hlSize, setHlSize] = useState(22);
  const [showSettings, setShowSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const nextIdRef = useRef<number>(initial?.next_id ?? pages.length + 1);

  // ----- mutators -----
  function patchPage(id: number, patch: Partial<NotePage>) {
    setPages((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPage(afterId?: number) {
    setPages((cur) => {
      const newPage: NotePage = {
        id: nextIdRef.current++,
        text: '',
        strokes: [],
        template: cur[cur.length - 1]?.template ?? 'lined',
      };
      if (afterId === undefined) return [...cur, newPage];
      const idx = cur.findIndex((p) => p.id === afterId);
      if (idx === -1) return [...cur, newPage];
      return [...cur.slice(0, idx + 1), newPage, ...cur.slice(idx + 1)];
    });
  }

  function removePage(id: number) {
    if (pages.length <= 1) return;
    if (!window.confirm('delete this page?')) return;
    setPages((cur) => cur.filter((p) => p.id !== id));
  }

  // ----- auto-save (debounced) -----
  const saveTimer = useRef<number | null>(null);
  const lastSerialized = useRef<string>('');
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const buildFirstPageSvg = useCallback((): string => {
    const first = pages[0];
    if (!first) return '';
    const w = first.w ?? 800;
    const h = first.h ?? 600;
    const bg = buildPaperBgSvg(first.template, w, h);
    const sorted = [...first.strokes].sort((a, b) =>
      a.tool === b.tool ? 0 : a.tool === 'highlighter' ? -1 : 1,
    );
    const paths = sorted
      .map((s) => {
        const d = svgPathFromStroke(s.points, s.size);
        if (!d) return '';
        return `<path d="${d}" fill="${s.color}" opacity="${s.tool === 'highlighter' ? 0.4 : 1}" />`;
      })
      .filter(Boolean)
      .join('');
    // preview also includes a snippet of the typed text so thumbnails read at-a-glance
    const textPreview = first.text
      ? `<text x="40" y="${40 + 18}" font-family="'Bricolage Grotesque', sans-serif" font-size="18" fill="#2a2520">${escapeXml(first.text.split('\n')[0] ?? '').slice(0, 64)}</text>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg}${paths}${textPreview}</svg>`;
  }, [pages]);

  useEffect(() => {
    const data: NoteCanvasData = {
      pages,
      svg: buildFirstPageSvg(),
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
        window.setTimeout(
          () => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)),
          1200,
        );
      } catch {
        setSaveStatus('idle');
      }
    }, 600);
  }, [pages, buildFirstPageSvg]);

  // ----- derived (tool-aware) -----
  const activeColor = tool === 'highlighter' ? hlColor : penColor;
  const activeColors = tool === 'highlighter' ? HL_COLORS : PEN_COLORS;
  const activeSize = tool === 'highlighter' ? hlSize : penSize;
  const activeSizes = tool === 'highlighter' ? HL_SIZES : PEN_SIZES;
  function setActiveColor(c: string) {
    if (tool === 'highlighter') setHlColor(c);
    else setPenColor(c);
  }
  function setActiveSize(s: number) {
    if (tool === 'highlighter') setHlSize(s);
    else setPenSize(s);
  }

  function nextStrokeId(): number {
    const id = nextIdRef.current++;
    return id;
  }

  return (
    <div className="mb-4">
      {/* sticky slim toolbar */}
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[820px] items-center gap-0.5 rounded-pill border border-ink/15 bg-bg/90 px-1.5 py-1 shadow-[0_2px_8px_rgba(42,37,32,0.06)]">
          <ToolIcon active={tool === 'text'} onClick={() => { setTool('text'); setShowSettings(false); }} label="text">
            T
          </ToolIcon>
          <ToolIcon active={tool === 'pen'} onClick={() => { setTool('pen'); setShowSettings(false); }} label="pen">
            ✎
          </ToolIcon>
          <ToolIcon active={tool === 'highlighter'} onClick={() => { setTool('highlighter'); setShowSettings(false); }} label="highlighter">
            ▮
          </ToolIcon>
          <ToolIcon active={tool === 'eraser'} onClick={() => { setTool('eraser'); setShowSettings(false); }} label="eraser">
            ◌
          </ToolIcon>

          {(tool === 'pen' || tool === 'highlighter') && (
            <div className="relative ml-1">
              <button
                onClick={() => setShowSettings((s) => !s)}
                aria-label="ink settings"
                title="color · size"
                className={clsx(
                  'flex h-8 items-center gap-1.5 rounded-pill border border-ink/20 bg-surface px-2 transition-colors hover:border-ink',
                  showSettings && 'border-ink',
                )}
              >
                <span
                  className="block h-4 w-4 rounded-full border border-ink/30"
                  style={{
                    background: activeColor,
                    opacity: tool === 'highlighter' ? 0.65 : 1,
                  }}
                />
                <span
                  className="block rounded-full"
                  style={{
                    width: Math.min(activeSize + 2, 12),
                    height: Math.min(activeSize + 2, 12),
                    background: tool === 'highlighter' ? `${activeColor}66` : activeColor,
                  }}
                />
              </button>
              {showSettings && (
                <div className="absolute left-0 top-full z-30 mt-1.5 flex flex-col gap-2 rounded-[12px] border-2 border-ink bg-surface p-2 shadow-card-sm">
                  <div className="flex items-center gap-1">
                    {activeColors.map((c) => (
                      <button
                        key={c}
                        onClick={() => setActiveColor(c)}
                        aria-label={`color ${c}`}
                        className={clsx(
                          'h-7 w-7 rounded-full border-2 transition-transform',
                          activeColor === c ? 'border-ink scale-110' : 'border-ink/20',
                        )}
                        style={{
                          background: c,
                          opacity: tool === 'highlighter' ? 0.65 : 1,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {activeSizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setActiveSize(s)}
                        aria-label={`size ${s}`}
                        className={clsx(
                          'flex h-7 w-7 items-center justify-center rounded-full border-2',
                          activeSize === s ? 'border-ink bg-bg' : 'border-ink/20',
                        )}
                      >
                        <span
                          className="block rounded-full"
                          style={{
                            width: Math.min(s + 2, 16),
                            height: Math.min(s + 2, 16),
                            background:
                              tool === 'highlighter' ? `${activeColor}66` : activeColor,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <span
              className={clsx(
                'min-w-[40px] text-center font-mono text-[10px] uppercase tracking-mono transition-opacity',
                saveStatus === 'idle' && 'opacity-0',
                saveStatus === 'saving' && 'text-ink-soft',
                saveStatus === 'saved' && 'text-mint-deep',
              )}
            >
              {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? 'saved' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* page stack */}
      <div className="px-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[820px] flex-col gap-6">
          {pages.map((page, i) => (
            <PageSheet
              key={page.id}
              page={page}
              pageNumber={i + 1}
              totalPages={pages.length}
              tool={tool}
              penColor={penColor}
              penSize={penSize}
              hlColor={hlColor}
              hlSize={hlSize}
              onTextChange={(text) => patchPage(page.id, { text })}
              onStrokesChange={(strokes) => patchPage(page.id, { strokes })}
              onTemplateChange={(template) => patchPage(page.id, { template })}
              onDimsChange={(w, h) => patchPage(page.id, { w, h })}
              onRemove={() => removePage(page.id)}
              nextStrokeId={nextStrokeId}
              canRemove={pages.length > 1}
            />
          ))}

          <button
            onClick={() => addPage()}
            className="mx-auto inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-ink-faint bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-mono text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            <span className="text-[14px]">+</span> add page
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// per-page sheet — paper, textarea, ink overlay
// ============================================================================
interface PageSheetProps {
  page: NotePage;
  pageNumber: number;
  totalPages: number;
  tool: Tool;
  penColor: string;
  penSize: number;
  hlColor: string;
  hlSize: number;
  onTextChange: (text: string) => void;
  onStrokesChange: (strokes: Stroke[]) => void;
  onTemplateChange: (template: Template) => void;
  onDimsChange: (w: number, h: number) => void;
  onRemove: () => void;
  nextStrokeId: () => number;
  canRemove: boolean;
}

function PageSheet({
  page,
  pageNumber,
  totalPages,
  tool,
  penColor,
  penSize,
  hlColor,
  hlSize,
  onTextChange,
  onStrokesChange,
  onTemplateChange,
  onDimsChange,
  onRemove,
  nextStrokeId,
  canRemove,
}: PageSheetProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [dims, setDims] = useState({ w: page.w ?? 0, h: page.h ?? 0 });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // measure
  useEffect(() => {
    function measure() {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (r && (r.width !== dims.w || r.height !== dims.h)) {
        setDims({ w: r.width, h: r.height });
        onDimsChange(r.width, r.height);
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (surfaceRef.current) ro.observe(surfaceRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-grow the textarea with its content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [page.text]);

  function relPoint(e: ReactPointerEvent<HTMLDivElement>): Pt {
    const r = surfaceRef.current!.getBoundingClientRect();
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  }

  function eraseAt(p: [number, number]) {
    for (let i = page.strokes.length - 1; i >= 0; i--) {
      const s = page.strokes[i];
      const hit = (s.size + 14) * (s.size + 14);
      for (const pt of s.points) {
        const dx = pt[0] - p[0];
        const dy = pt[1] - p[1];
        if (dx * dx + dy * dy <= hit) {
          onStrokesChange(page.strokes.filter((_, idx) => idx !== i));
          return;
        }
      }
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'text') return; // textarea handles its own pointers
    if (e.button !== 0 && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (tool === 'eraser') {
      const r = surfaceRef.current!.getBoundingClientRect();
      eraseAt([e.clientX - r.left, e.clientY - r.top]);
      return;
    }

    const isHl = tool === 'highlighter';
    setCurrent({
      id: nextStrokeId(),
      points: [relPoint(e)],
      color: isHl ? hlColor : penColor,
      size: isHl ? hlSize : penSize,
      tool: isHl ? 'highlighter' : 'pen',
    });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'text') return;
    if (tool === 'eraser') {
      if (e.buttons === 0 && e.pointerType !== 'pen') return;
      const r = surfaceRef.current!.getBoundingClientRect();
      eraseAt([e.clientX - r.left, e.clientY - r.top]);
      return;
    }
    if (!current) return;
    if (e.buttons === 0 && e.pointerType !== 'pen') return;
    setCurrent((c) => (c ? { ...c, points: [...c.points, relPoint(e)] } : c));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (tool === 'eraser' || tool === 'text') return;
    if (!current) return;
    if (current.points.length > 1) {
      onStrokesChange([...page.strokes, current]);
    }
    setCurrent(null);
  }

  const allStrokes = current ? [...page.strokes, current] : page.strokes;
  const sortedStrokes = [...allStrokes].sort((a, b) =>
    a.tool === b.tool ? 0 : a.tool === 'highlighter' ? -1 : 1,
  );

  // Sized to match the lined-paper rhythm: ~28px row height, font ~18
  const fontSize = 17;
  const lineHeight = 28;

  return (
    <div className="relative">
      {/* page header — number + paper picker + delete */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
          page {pageNumber} / {totalPages}
        </span>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="rounded-pill px-2 py-0.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft hover:bg-bg-soft hover:text-ink"
          >
            {TEMPLATES.find((t) => t.key === page.template)?.label} ▾
          </button>
          {showTemplatePicker && (
            <div className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-1 rounded-[10px] border-2 border-ink bg-surface p-1.5 shadow-card-sm">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    onTemplateChange(t.key);
                    setShowTemplatePicker(false);
                  }}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-left font-mono text-[11px] uppercase tracking-mono',
                    page.template === t.key ? 'bg-peach text-ink' : 'hover:bg-bg-soft',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {canRemove && (
            <button
              onClick={onRemove}
              title="delete this page"
              aria-label="delete page"
              className="rounded-pill px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft hover:bg-rose hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* paper sheet */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={clsx(
          'relative min-h-[460px] touch-none overflow-hidden rounded-[6px] border border-ink/15 bg-surface shadow-[0_8px_28px_rgba(42,37,32,0.10),0_2px_4px_rgba(42,37,32,0.06)]',
          tool === 'eraser' && 'cursor-crosshair',
          tool === 'text' && 'cursor-text',
        )}
        style={paperBgStyle(page.template, lineHeight)}
      >
        {/* text layer — fills the paper with comfortable margins */}
        <textarea
          ref={textareaRef}
          value={page.text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={
            pageNumber === 1
              ? 'tap and type · switch to pen to draw'
              : ''
          }
          spellCheck
          className={clsx(
            'relative block w-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-faint',
            tool === 'text' ? 'pointer-events-auto' : 'pointer-events-none',
          )}
          style={{
            padding: '36px 44px',
            fontSize,
            lineHeight: `${lineHeight}px`,
            fontFamily:
              '"Bricolage Grotesque", system-ui, -apple-system, sans-serif',
            caretColor: '#2a2520',
            minHeight: '460px',
          }}
        />

        {/* ink overlay — sits on top of the text */}
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
      </div>
    </div>
  );
}

// ============================================================================
// helpers
// ============================================================================
function ToolIcon({
  active,
  onClick,
  label,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        'flex h-8 w-8 items-center justify-center rounded-pill font-mono text-[14px] transition-colors',
        active ? 'bg-peach text-ink' : 'text-ink-soft hover:bg-bg-soft hover:text-ink',
        disabled && 'opacity-40 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function paperBgStyle(template: Template, lineHeight = 28): React.CSSProperties {
  const ink = 'rgba(42,37,32,0.16)';
  const inkLine = 'rgba(42,37,32,0.10)';
  switch (template) {
    case 'dotted':
      return {
        backgroundImage: `radial-gradient(circle at 1px 1px, ${ink} 1px, transparent 0)`,
        backgroundSize: '22px 22px',
      };
    case 'lined':
      return {
        // align with text baseline by repeating at lineHeight
        backgroundImage: `linear-gradient(to bottom, transparent calc(${lineHeight}px - 1px), ${inkLine} ${lineHeight}px, transparent ${lineHeight}px)`,
        backgroundSize: `100% ${lineHeight}px`,
        backgroundPosition: '0 36px',
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPaperBgSvg(template: Template, w: number, h: number): string {
  if (template === 'blank') return '';
  if (template === 'dotted') {
    return `<defs><pattern id="bgDots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(42,37,32,0.16)"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgDots)"/>`;
  }
  if (template === 'lined') {
    return `<defs><pattern id="bgLines" width="${w}" height="28" patternUnits="userSpaceOnUse"><line x1="0" y1="28" x2="${w}" y2="28" stroke="rgba(42,37,32,0.10)" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgLines)"/>`;
  }
  if (template === 'grid') {
    return `<defs><pattern id="bgGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(42,37,32,0.10)" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#bgGrid)"/>`;
  }
  return '';
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
