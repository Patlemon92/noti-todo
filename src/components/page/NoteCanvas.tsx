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
  CanvasImage,
  CanvasStroke as Stroke,
  CanvasTextBox,
  NoteCanvasData,
  NotePage,
  TiptapDoc,
} from '../../lib/types';
import MarkdownEditor from './MarkdownEditor';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'lasso';
type Template = 'blank' | 'dotted' | 'lined' | 'grid';
type Pt = [number, number, number];

const PEN_COLORS = ['#2a2520', '#e88562', '#7fb389', '#8db4c8', '#a896d4', '#e8c75f'];
const HL_COLORS = ['#fbeb5b', '#a3e3a3', '#9dc6e8', '#f4a3a3', '#e3b8f5', '#ffb37b'];
const PEN_SIZES = [2, 4, 7, 12];
const HL_SIZES = [14, 22, 32];
/** App-level palm rejection window. Touches that arrive within this many ms
 * of the last Apple Pencil event are ignored. Long enough to cover a palm
 * landing between strokes, short enough that putting the Pencil down and
 * finger-drawing within ~2s still works. */
const PEN_DOMINANCE_MS = 1500;

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
  if (initial?.pages && initial.pages.length > 0) {
    // Ensure every page has a body (migrate plain text on first load).
    return initial.pages.map((p) => ({
      ...p,
      body: p.body ?? textToTiptapDoc(p.text ?? ''),
    }));
  }
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
        body: textToTiptapDoc(text),
        strokes: initial.strokes ?? [],
        template: initial.template ?? 'lined',
        w: initial.w,
        h: initial.h,
      },
    ];
  }
  // fresh: one empty page
  return [
    {
      id: 1,
      text: '',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      strokes: [],
      template: 'lined',
    },
  ];
}

/** Each line of plain text becomes a Tiptap paragraph. */
function textToTiptapDoc(text: string): TiptapDoc {
  if (!text || !text.trim()) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) =>
      line.trim()
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
    ),
  };
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

  function nextStrokeId(): number {
    return nextIdRef.current++;
  }

  // ----- image insert -----
  const imageInputRef = useRef<HTMLInputElement>(null);
  function onPickImage() {
    imageInputRef.current?.click();
  }
  function readAndPlaceImage(file: File, pageId?: number) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // scale so longest side <= 500 (UI footprint, not file size)
        const max = 500;
        const ratio = img.width > img.height ? max / img.width : max / img.height;
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const newImg: CanvasImage = {
          id: nextStrokeId(),
          x: 40,
          y: 40,
          w,
          h,
          src: dataUrl,
        };
        const target = pageId ?? pages[0]?.id;
        if (target === undefined) return;
        setPages((cur) =>
          cur.map((p) =>
            p.id === target ? { ...p, images: [...(p.images ?? []), newImg] } : p,
          ),
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
  function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readAndPlaceImage(file);
    if (e.target) e.target.value = ''; // allow re-selecting the same file
  }

  // paste handler — when canvas is interacted with, pasting an image inserts it
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      // ignore paste inside any focused input/textarea (let them get the text)
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      const items = Array.from(e.clipboardData.items);
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            readAndPlaceImage(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

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
        const d = svgPathFromStroke(s.points, s.size, s.inputType, s.tool);
        if (!d) return '';
        return `<path d="${d}" fill="${s.color}" opacity="${s.tool === 'highlighter' ? 0.4 : 1}" />`;
      })
      .filter(Boolean)
      .join('');
    // images render below ink in the preview
    const imageEls = (first.images ?? [])
      .map(
        (im) =>
          `<image href="${im.src}" x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" />`,
      )
      .join('');
    // preview also includes a snippet of the typed text so thumbnails read at-a-glance
    const textPreview = first.text
      ? `<text x="40" y="${40 + 18}" font-family="'Bricolage Grotesque', sans-serif" font-size="18" fill="#2a2520">${escapeXml(first.text.split('\n')[0] ?? '').slice(0, 64)}</text>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg}${imageEls}${paths}${textPreview}</svg>`;
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

  return (
    <div className="mb-4">
      {/* slim toolbar — same horizontal width as the paper, sits just above it */}
      <div className="mb-1 px-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-1 rounded-pill border border-ink/10 bg-bg-soft/60 px-1.5 py-0.5">
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
          <ToolIcon active={tool === 'lasso'} onClick={() => { setTool('lasso'); setShowSettings(false); }} label="lasso">
            ⌖
          </ToolIcon>
          <ToolIcon onClick={onPickImage} label="insert image">
            <PhotoFrameIcon />
          </ToolIcon>

          {/* paper template inline in the global toolbar */}
          <span className="mx-1 h-4 w-px bg-ink/15" />
          {pages[0] && (
            <PaperTemplateInline
              current={pages[0].template}
              onPick={(t) =>
                setPages((cur) => cur.map((p) => ({ ...p, template: t })))
              }
            />
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={onImageFileChange}
            className="hidden"
          />

          {(tool === 'pen' || tool === 'highlighter') && (
            <div className="relative ml-1">
              <button
                onClick={() => setShowSettings((s) => !s)}
                aria-label="ink settings"
                title="color · size"
                className={clsx(
                  'flex h-7 items-center gap-1.5 rounded-pill border border-ink/20 bg-surface px-2 transition-colors hover:border-ink',
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
                    {/* custom color — opens native picker. swatch shows the
                     * current custom pick when it isn't one of the presets,
                     * otherwise shows a small rainbow hint. */}
                    <label
                      className={clsx(
                        'relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform',
                        !activeColors.includes(activeColor) ? 'border-ink scale-110' : 'border-ink/20',
                      )}
                      title="custom colour"
                      aria-label="custom colour"
                      style={{
                        background: !activeColors.includes(activeColor)
                          ? activeColor
                          : 'conic-gradient(from 0deg, #e88562, #e8c75f, #7fb389, #8db4c8, #a896d4, #e88562)',
                        opacity: tool === 'highlighter' && !activeColors.includes(activeColor) ? 0.65 : 1,
                      }}
                    >
                      <input
                        type="color"
                        value={activeColor}
                        onChange={(e) => setActiveColor(e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      {activeColors.includes(activeColor) && (
                        <span className="pointer-events-none text-[12px] leading-none text-ink mix-blend-difference">
                          +
                        </span>
                      )}
                    </label>
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

          <span
            className={clsx(
              'ml-auto text-center font-mono text-[10px] uppercase tracking-mono transition-opacity',
              saveStatus === 'idle' && 'opacity-0',
              saveStatus === 'saving' && 'text-ink-soft',
              saveStatus === 'saved' && 'text-mint-deep',
            )}
          >
            {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? 'saved' : ''}
          </span>
        </div>
      </div>

      {/* page stack */}
      <div className="px-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
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
              onBodyChange={(body) => patchPage(page.id, { body })}
              onStrokesChange={(strokes) => patchPage(page.id, { strokes })}
              onImagesChange={(images) => patchPage(page.id, { images })}
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
  onBodyChange: (body: TiptapDoc) => void;
  onStrokesChange: (strokes: Stroke[]) => void;
  onImagesChange: (images: CanvasImage[]) => void;
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
  onBodyChange,
  onStrokesChange,
  onImagesChange,
  onTemplateChange,
  onDimsChange,
  onRemove,
  nextStrokeId,
  canRemove,
}: PageSheetProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [dims, setDims] = useState({ w: page.w ?? 0, h: page.h ?? 0 });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Active pointers — used to detect a second finger landing so we can cancel
  // the in-progress stroke and hand the gesture to a manual two-finger scroll.
  // touch-action: none on the surface kills the browser's own gesture handling
  // (needed for one-finger drawing), so without this we lose page scrolling
  // entirely while a drawing tool is active.
  const activePointersRef = useRef<
    Map<number, { y: number; type: string }>
  >(new Map());
  const twoFingerScrollRef = useRef<{ lastY: number } | null>(null);
  // The pointerId that owns the current stroke. Used to reject move/up
  // events from other pointers (e.g. a palm dragging across the screen
  // while the pencil is mid-stroke).
  const strokePointerIdRef = useRef<number | null>(null);
  // Timestamp of the last Apple Pencil event. While a pen is "recently
  // active" (within PEN_DOMINANCE_MS), all touch pointers are rejected at
  // the app level — iOS's own palm rejection isn't perfect and palms slip
  // through as touch events, cancelling pen strokes. Procreate / GoodNotes
  // do the same.
  const lastPenAtRef = useRef<number>(0);

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


  function relPoint(e: ReactPointerEvent<HTMLDivElement>): Pt {
    const r = surfaceRef.current!.getBoundingClientRect();
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  }

  function eraseAt(p: [number, number]) {
    // Pixel eraser: split each stroke at points within the eraser radius
    // instead of removing the whole stroke. Each contiguous run of surviving
    // points becomes its own sub-stroke (with a new id). Also removes any
    // image whose bounding box the eraser is over.
    const ERASER_RADIUS = 16;
    const r2 = ERASER_RADIUS * ERASER_RADIUS;

    // images first (bounding-box hit)
    const imgs = page.images ?? [];
    for (let i = imgs.length - 1; i >= 0; i--) {
      const im = imgs[i];
      if (p[0] >= im.x && p[0] <= im.x + im.w && p[1] >= im.y && p[1] <= im.y + im.h) {
        onImagesChange(imgs.filter((_, idx) => idx !== i));
        return;
      }
    }

    const next: Stroke[] = [];
    let anyChanged = false;
    for (const stroke of page.strokes) {
      let segment: Pt[] = [];
      const segments: Pt[][] = [];
      let strokeChanged = false;
      for (const pt of stroke.points) {
        const dx = pt[0] - p[0];
        const dy = pt[1] - p[1];
        if (dx * dx + dy * dy <= r2) {
          if (segment.length > 1) segments.push(segment);
          segment = [];
          strokeChanged = true;
        } else {
          segment.push(pt);
        }
      }
      if (segment.length > 1) segments.push(segment);
      if (!strokeChanged) {
        next.push(stroke);
      } else {
        anyChanged = true;
        for (const seg of segments) {
          next.push({ ...stroke, id: nextStrokeId(), points: seg });
        }
      }
    }
    if (anyChanged) onStrokesChange(next);
  }

  // ----- lasso selection -----
  const [lassoPoints, setLassoPoints] = useState<Array<[number, number]>>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<number>>(new Set());
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);

  function pointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect =
        yi > point[1] !== yj > point[1] &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function finishLasso() {
    if (lassoPoints.length < 3) {
      setLassoPoints([]);
      return;
    }
    const strokeIds = new Set<number>();
    for (const stroke of page.strokes) {
      // count points inside polygon — select if majority is inside
      let inside = 0;
      for (const pt of stroke.points) {
        if (pointInPolygon([pt[0], pt[1]], lassoPoints)) inside++;
      }
      if (inside > stroke.points.length / 2) strokeIds.add(stroke.id);
    }
    const imageIds = new Set<number>();
    for (const im of page.images ?? []) {
      const cx = im.x + im.w / 2;
      const cy = im.y + im.h / 2;
      if (pointInPolygon([cx, cy], lassoPoints)) imageIds.add(im.id);
    }
    setSelectedStrokeIds(strokeIds);
    setSelectedImageIds(imageIds);
    setLassoPoints([]);
  }

  function clearSelection() {
    setSelectedStrokeIds(new Set());
    setSelectedImageIds(new Set());
  }

  function deleteSelection() {
    if (selectedStrokeIds.size > 0) {
      onStrokesChange(page.strokes.filter((s) => !selectedStrokeIds.has(s.id)));
    }
    if (selectedImageIds.size > 0) {
      onImagesChange((page.images ?? []).filter((im) => !selectedImageIds.has(im.id)));
    }
    clearSelection();
  }

  // selection bounding box (in canvas coords)
  function selectionBbox(): { x: number; y: number; w: number; h: number } | null {
    if (selectedStrokeIds.size === 0 && selectedImageIds.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of page.strokes) {
      if (!selectedStrokeIds.has(s.id)) continue;
      for (const [x, y] of s.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    for (const im of page.images ?? []) {
      if (!selectedImageIds.has(im.id)) continue;
      if (im.x < minX) minX = im.x;
      if (im.y < minY) minY = im.y;
      if (im.x + im.w > maxX) maxX = im.x + im.w;
      if (im.y + im.h > maxY) maxY = im.y + im.h;
    }
    if (minX === Infinity) return null;
    return { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };
  }

  function moveSelection(dx: number, dy: number) {
    if (selectedStrokeIds.size > 0) {
      onStrokesChange(
        page.strokes.map((s) =>
          selectedStrokeIds.has(s.id)
            ? { ...s, points: s.points.map(([x, y, p]): Pt => [x + dx, y + dy, p]) }
            : s,
        ),
      );
    }
    if (selectedImageIds.size > 0) {
      onImagesChange(
        (page.images ?? []).map((im) =>
          selectedImageIds.has(im.id) ? { ...im, x: im.x + dx, y: im.y + dy } : im,
        ),
      );
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'text') return; // textarea handles its own pointers
    if (e.button !== 0 && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;

    // App-level pen dominance. The moment a Pencil lands, abandon any
    // touch-derived state (phantom palms, stuck two-finger scrolls) — the
    // user has committed to drawing with the Pencil.
    if (e.pointerType === 'pen') {
      lastPenAtRef.current = Date.now();
      activePointersRef.current.clear();
      twoFingerScrollRef.current = null;
    }

    // Track active pointers (touch only — pen + mouse never multi-touch).
    if (e.pointerType === 'touch') {
      // Pencil-recently-active → this touch is almost certainly a palm.
      // Reject entirely (don't track, don't draw, don't scroll).
      if (Date.now() - lastPenAtRef.current < PEN_DOMINANCE_MS) return;
      // Pencil mid-stroke (race against the time window) → still reject.
      if (strokePointerIdRef.current !== null) return;
      activePointersRef.current.set(e.pointerId, {
        y: e.clientY,
        type: e.pointerType,
      });
      // Second finger landed → cancel current stroke, hand off to manual scroll.
      const touches = Array.from(activePointersRef.current.values()).filter(
        (p) => p.type === 'touch',
      );
      if (touches.length >= 2) {
        setCurrent(null);
        setLassoPoints([]);
        setDragStart(null);
        const midY = touches.reduce((a, b) => a + b.y, 0) / touches.length;
        twoFingerScrollRef.current = { lastY: midY };
        return;
      }
    }

    // Capture on currentTarget (the surface div) — not e.target, which can
    // resolve to a descendant in some browsers even with pointer-events:none.
    // Wrong-target capture loses move events partway through a stroke.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = surfaceRef.current!.getBoundingClientRect();
    const p: [number, number] = [e.clientX - r.left, e.clientY - r.top];

    if (tool === 'eraser') {
      eraseAt(p);
      return;
    }

    if (tool === 'lasso') {
      const bbox = selectionBbox();
      if (bbox && p[0] >= bbox.x && p[0] <= bbox.x + bbox.w && p[1] >= bbox.y && p[1] <= bbox.y + bbox.h) {
        // dragging existing selection
        setDragStart(p);
      } else {
        // start a new lasso
        clearSelection();
        setLassoPoints([p]);
      }
      return;
    }

    const isHl = tool === 'highlighter';
    const inputType: 'pen' | 'touch' | 'mouse' =
      e.pointerType === 'pen'
        ? 'pen'
        : e.pointerType === 'mouse'
          ? 'mouse'
          : 'touch';
    strokePointerIdRef.current = e.pointerId;
    setCurrent({
      id: nextStrokeId(),
      points: [relPoint(e)],
      color: isHl ? hlColor : penColor,
      size: isHl ? hlSize : penSize,
      tool: isHl ? 'highlighter' : 'pen',
      inputType,
    });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    // Two-finger scroll mode — pan the window by the midpoint delta.
    if (twoFingerScrollRef.current && e.pointerType === 'touch') {
      const tracked = activePointersRef.current.get(e.pointerId);
      if (tracked) tracked.y = e.clientY;
      const touches = Array.from(activePointersRef.current.values()).filter(
        (p) => p.type === 'touch',
      );
      if (touches.length >= 2) {
        const midY = touches.reduce((a, b) => a + b.y, 0) / touches.length;
        const dy = midY - twoFingerScrollRef.current.lastY;
        if (dy !== 0) window.scrollBy(0, -dy);
        twoFingerScrollRef.current.lastY = midY;
      }
      return;
    }

    if (tool === 'text') return;
    if (tool === 'eraser') {
      if (e.buttons === 0 && e.pointerType !== 'pen') return;
      const r = surfaceRef.current!.getBoundingClientRect();
      eraseAt([e.clientX - r.left, e.clientY - r.top]);
      return;
    }
    if (tool === 'lasso') {
      if (e.buttons === 0) return;
      const r = surfaceRef.current!.getBoundingClientRect();
      const p: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      if (dragStart) {
        const dx = p[0] - dragStart[0];
        const dy = p[1] - dragStart[1];
        moveSelection(dx, dy);
        setDragStart(p);
      } else if (lassoPoints.length > 0) {
        setLassoPoints((cur) => [...cur, p]);
      }
      return;
    }
    if (!current) return;
    // Ignore moves from any pointer that didn't start this stroke (palm
    // dragging while pencil writes, second finger drifting, etc.).
    if (strokePointerIdRef.current !== null && e.pointerId !== strokePointerIdRef.current) return;
    if (e.buttons === 0 && e.pointerType !== 'pen') return;
    if (e.pointerType === 'pen') lastPenAtRef.current = Date.now();
    setCurrent((c) => (c ? { ...c, points: [...c.points, relPoint(e)] } : c));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (e.pointerType === 'pen') {
      // Refresh the dominance window so palms between letters still get
      // rejected. Without this, a palm landing 200ms after pen-up would be
      // accepted and trigger a phantom stroke or two-finger scroll.
      lastPenAtRef.current = Date.now();
    }

    if (e.pointerType === 'touch') {
      activePointersRef.current.delete(e.pointerId);
    }

    if (twoFingerScrollRef.current) {
      const touches = Array.from(activePointersRef.current.values()).filter(
        (p) => p.type === 'touch',
      );
      if (touches.length < 2) twoFingerScrollRef.current = null;
      return;
    }

    if (tool === 'lasso') {
      if (dragStart) {
        setDragStart(null);
      } else {
        finishLasso();
      }
      return;
    }
    if (tool === 'eraser' || tool === 'text') return;
    if (!current) return;
    // Only finalize if this is the stroke-owning pointer lifting.
    if (strokePointerIdRef.current !== null && e.pointerId !== strokePointerIdRef.current) return;
    // Save even a single-point stroke — it renders as a felt-tip dot.
    // Previously dropped 1-point strokes meant quick taps (dotting i's,
    // periods) just vanished.
    if (current.points.length >= 1) {
      onStrokesChange([...page.strokes, current]);
    }
    setCurrent(null);
    strokePointerIdRef.current = null;
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
      {/* page header — only renders chrome when there's MORE than one page.
       * single-page notes have zero header height (paper sits right under toolbar). */}
      {totalPages > 1 ? (
      <div className="mb-1 flex h-[18px] items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
          page {pageNumber} / {totalPages}
        </span>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="rounded-pill px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-mono text-ink-faint hover:bg-bg-soft hover:text-ink-soft"
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
      ) : null}

      {/* paper sheet */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={clsx(
          'relative min-h-[640px] overflow-hidden rounded-[6px] border border-ink/15 bg-surface shadow-[0_8px_28px_rgba(42,37,32,0.10),0_2px_4px_rgba(42,37,32,0.06)]',
          tool === 'eraser' && 'cursor-crosshair',
          tool === 'text' && 'cursor-text',
        )}
        style={{
          ...paperBgStyle(page.template, lineHeight),
          // text mode: full browser gestures (selection, scroll, zoom).
          // drawing modes: kill browser gestures so one-finger draws cleanly;
          // two-finger scroll is handled manually in onPointerMove.
          touchAction: tool === 'text' ? 'auto' : 'none',
        }}
      >
        {/* text layer — Tiptap with markdown shortcuts.
         * The wrapper takes pointer-events: none whenever a drawing tool is
         * active so strokes pass cleanly through to the surface handler. Setting
         * it only on the inner contenteditable wasn't enough — Tiptap's outer
         * wrapper still caught some events and dropped strokes mid-line. */}
        <div
          className="relative"
          style={{ pointerEvents: tool === 'text' ? 'auto' : 'none' }}
        >
          <MarkdownEditor
            resetKey={page.id}
            initial={page.body}
            onChange={onBodyChange}
            pointerEnabled={tool === 'text'}
            placeholder={
              pageNumber === 1
                ? 'tap and type · # for heading · - for list · > for quote'
                : undefined
            }
          />
        </div>

        {/* image layer — between text and ink */}
        {(page.images ?? []).map((im) => (
          <img
            key={im.id}
            src={im.src}
            alt=""
            draggable={false}
            className={clsx(
              'absolute select-none rounded-md shadow-sm',
              selectedImageIds.has(im.id) && 'ring-2 ring-coral',
            )}
            style={{
              left: im.x,
              top: im.y,
              width: im.w,
              height: im.h,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* ink overlay — sits on top of text + images */}
        <svg
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          width={dims.w}
          height={dims.h}
          className="pointer-events-none absolute inset-0"
        >
          {sortedStrokes.map((s) => {
            const d = svgPathFromStroke(s.points, s.size, s.inputType, s.tool);
            if (!d) return null;
            return (
              <path
                key={s.id}
                d={d}
                fill={s.color}
                opacity={s.tool === 'highlighter' ? 0.4 : 1}
                stroke={selectedStrokeIds.has(s.id) ? '#e88562' : undefined}
                strokeWidth={selectedStrokeIds.has(s.id) ? 1.5 : 0}
              />
            );
          })}

          {/* live lasso path */}
          {lassoPoints.length > 1 && (
            <path
              d={
                'M' +
                lassoPoints.map(([x, y]) => `${x},${y}`).join(' L') +
                ' Z'
              }
              fill="rgba(232,133,98,0.10)"
              stroke="#e88562"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}

          {/* selection bounding box */}
          {(() => {
            const bbox = selectionBbox();
            if (!bbox) return null;
            return (
              <rect
                x={bbox.x}
                y={bbox.y}
                width={bbox.w}
                height={bbox.h}
                fill="rgba(232,133,98,0.06)"
                stroke="#e88562"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                rx="4"
              />
            );
          })()}
        </svg>

        {/* selection floating action — appears next to selection bbox */}
        {(() => {
          const bbox = selectionBbox();
          if (!bbox || tool !== 'lasso') return null;
          return (
            <div
              className="absolute z-10 flex items-center gap-1 rounded-pill border-2 border-ink bg-surface px-2 py-1 shadow-card-sm"
              style={{
                left: Math.max(8, bbox.x),
                top: Math.max(8, bbox.y - 36),
              }}
            >
              <button
                onClick={deleteSelection}
                className="rounded-md border border-rose-deep bg-rose/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-mono text-ink"
              >
                ✕ delete
              </button>
              <button
                onClick={clearSelection}
                className="rounded-md border border-ink/30 bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft"
              >
                deselect
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ============================================================================
// helpers
// ============================================================================
/** Paper template chooser — sits in the global toolbar, applies to all pages. */
function PaperTemplateInline({
  current,
  onPick,
}: {
  current: Template;
  onPick: (t: Template) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-pill px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft hover:bg-bg-soft hover:text-ink"
        title="paper template"
      >
        {TEMPLATES.find((t) => t.key === current)?.label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 flex flex-col gap-1 rounded-[10px] border-2 border-ink bg-surface p-1.5 shadow-card-sm">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                onPick(t.key);
                setOpen(false);
              }}
              className={clsx(
                'rounded-md px-3 py-1.5 text-left font-mono text-[11px] uppercase tracking-mono',
                current === t.key ? 'bg-peach text-ink' : 'hover:bg-bg-soft',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoFrameIcon() {
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
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 16l-5.5-5.5L7 19" />
    </svg>
  );
}

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
        'flex h-7 w-7 items-center justify-center rounded-pill font-mono text-[13px] transition-colors',
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

function svgPathFromStroke(
  points: Pt[],
  size: number,
  inputType: 'pen' | 'touch' | 'mouse' = 'touch',
  tool: 'pen' | 'highlighter' = 'pen',
): string {
  if (points.length === 0) return '';
  // Single-point tap → render as a filled circle so quick dots (full stops,
  // dotted i's) actually show up instead of vanishing.
  if (points.length === 1) {
    const [x, y] = points[0];
    const r = size / 2;
    return `M${(x - r).toFixed(2)} ${y.toFixed(2)} a${r} ${r} 0 1 0 ${(2 * r).toFixed(2)} 0 a${r} ${r} 0 1 0 ${(-2 * r).toFixed(2)} 0 Z`;
  }
  // Felt-tip pen + highlighter: uniform width, round caps, no calligraphic
  // taper. No pressure response — finger/pencil/mouse all draw a consistent
  // marker line.
  const stroke = getStroke(points, {
    size,
    thinning: 0,
    smoothing: 0.5,
    streamline: tool === 'highlighter' ? 0.4 : 0.5,
    simulatePressure: false,
    last: true,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
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
