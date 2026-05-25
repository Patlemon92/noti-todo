// ============================================================================
// journalSnaps — client-side helpers for the snap-and-extract flow.
//   - resizeToJpeg: client-side downscale + rotate so we don't upload 5 MB
//   - createSnap: upload to storage + insert journal_snaps row
//   - getSnap, getSnapPhotoUrl: read helpers for the status / confirm screens
//   - invokeExtraction: trigger the edge function (phase 5)
// ============================================================================

import { supabase } from './supabase';
import { createPage } from './db';
import { createReminder } from './reminders';
import type { TaskProperties, TiptapDoc } from './types';

// ----- extraction shape (matches the edge function output) ------------------

export type ItemCategory = 'reminder' | 'task' | 'note';

export interface ProcessedItem {
  title: string;
  category: ItemCategory;
  raw_text: string;
  resolved_date: string | null;          // ISO yyyy-mm-dd (UTC, no tz applied)
  date_suggestions: string[];
  time: { hour: number; minute: number } | null;
  confidence: number;
  flags: string[];
}

export interface ProcessedExtraction {
  items: ProcessedItem[];
  notes_blocks: Array<{ text: string; confidence: number }>;
}

export interface JournalSnap {
  id: string;
  owner_id: string;
  photo_storage_path: string;
  processed_at: string | null;
  raw_extraction: ProcessedExtraction | null;
  error: string | null;
  created_at: string;
}

/**
 * Downscale to max 1600px on the longest side, encode as JPEG ~0.82.
 * Uses `createImageBitmap` with `imageOrientation: 'from-image'` so EXIF
 * rotation from iPhone shots actually sticks.
 */
export async function resizeToJpeg(
  file: File,
  maxLong = 1600,
  quality = 0.82,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // older safari without the option — fall back to <img> decode (browser
    // applies orientation for the displayed image, canvas inherits that)
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      bitmap = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const ratio = Math.min(1, maxLong / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('canvas toBlob produced null');
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/**
 * Upload a journal-page photo to Supabase Storage and create the
 * journal_snaps row pointing at it. Does NOT invoke extraction —
 * caller decides when to fire that.
 */
export async function createSnap(file: File): Promise<JournalSnap> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('not signed in');

  const blob = await resizeToJpeg(file);
  // generate id client-side so we can name the storage path with it,
  // matching the journal_snaps row 1:1.
  const snapId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${user.id}/${snapId}.jpg`;

  const { error: upErr } = await supabase.storage
    .from('journal-snaps')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('journal_snaps')
    .insert({ id: snapId, owner_id: user.id, photo_storage_path: path })
    .select()
    .single();
  if (error) throw error;
  return data as JournalSnap;
}

export async function getSnap(id: string): Promise<JournalSnap | null> {
  const { data, error } = await supabase
    .from('journal_snaps')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as JournalSnap | null) ?? null;
}

/** Short-lived signed URL the client can render in <img>. 1h TTL — plenty. */
export async function getSnapPhotoUrl(snap: JournalSnap): Promise<string> {
  const { data, error } = await supabase.storage
    .from('journal-snaps')
    .createSignedUrl(snap.photo_storage_path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Invoke the extract-journal-snap edge function. Returns when the function
 * has processed the snap and updated the row. Caller re-fetches to read
 * raw_extraction. May reject if the function isn't deployed yet (phase 5).
 */
export async function invokeExtraction(snapId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('extract-journal-snap', {
    body: { snap_id: snapId },
  });
  if (error) throw error;
}

// ============================================================================
// save flow: extracted items → pages + reminders + notes
// ============================================================================

/**
 * Find the hidden parent board that owns journal-extracted items.
 * Returns null if the user hasn't saved any items yet (board is created
 * lazily on first save via getOrCreateJournalBoard).
 */
export async function getJournalBoardId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('pages')
    .select('id')
    .eq('owner_id', user.id)
    .eq('type', 'board')
    .filter('properties->>kind', 'eq', 'journal')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}

/**
 * Get-or-create the hidden parent board that owns all journal-extracted
 * items. We keep it as a board (matches existing schema), tagged with
 * properties.kind='journal' so it's findable but hidden from the regular
 * boards view.
 */
export async function getOrCreateJournalBoard(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data: existing, error: findErr } = await supabase
    .from('pages')
    .select('id, properties')
    .eq('owner_id', user.id)
    .eq('type', 'board')
    .filter('properties->>kind', 'eq', 'journal')
    .is('deleted_at', null)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id as string;

  const board = await createPage({
    type: 'board',
    title: 'from journal',
    properties: {
      // Tag this board so we can find it again, and hide from the (also
      // hidden post-pivot) boards view. The `BoardProperties` type doesn't
      // include `kind` — we cast through unknown to keep the typed surface
      // clean for the rest of the app.
      kind: 'journal',
      hidden: true,
    } as unknown as TaskProperties,
  });
  return board.id;
}

/**
 * Build an ISO due_at from a snap-extracted resolved_date + time in the
 * caller's local timezone. resolved_date is "yyyy-mm-dd" (UTC calendar
 * day); we interpret it as a local date and combine with hour/minute to
 * produce a real Date → ISO.
 */
export function buildDueAt(
  resolvedDate: string,
  time: { hour: number; minute: number } | null,
): string {
  const [y, m, d] = resolvedDate.split('-').map((s) => parseInt(s, 10));
  const local = new Date(
    y,
    (m ?? 1) - 1,
    d ?? 1,
    time?.hour ?? 9,
    time?.minute ?? 0,
    0,
    0,
  );
  return local.toISOString();
}

export interface SaveItemInput {
  title: string;
  category: ItemCategory;
  resolved_date: string | null;
  time: { hour: number; minute: number } | null;
  raw_text: string;
}

export interface SaveNoteInput {
  text: string;
}

export interface SaveResult {
  itemsCreated: number;
  remindersCreated: number;
  notesCreated: number;
}

/**
 * Persist an approved set of extracted items + notes from a snap.
 * - reminder/task items become pages under the hidden journal board;
 *   reminder items also get a page_actions reminder row so the existing
 *   push pipeline fires them.
 * - notes_blocks are combined into a single note page titled after the
 *   snap date.
 */
export async function saveExtractedItems(
  snap: JournalSnap,
  items: SaveItemInput[],
  notes: SaveNoteInput[],
): Promise<SaveResult> {
  const result: SaveResult = {
    itemsCreated: 0,
    remindersCreated: 0,
    notesCreated: 0,
  };

  let boardId: string | null = null;
  if (items.length > 0) {
    boardId = await getOrCreateJournalBoard();
  }

  for (const item of items) {
    const props: TaskProperties & { raw_text?: string; from_snap?: string } = {
      raw_text: item.raw_text,
      from_snap: snap.id,
    };
    let dueAt: string | null = null;
    if (item.resolved_date) {
      dueAt = buildDueAt(item.resolved_date, item.time);
      props.due_at = dueAt;
    }

    const page = await createPage({
      type: 'task',
      title: item.title.slice(0, 200),
      parent_id: boardId,
      properties: props,
    });
    result.itemsCreated++;

    // create a reminder so the existing push pipeline picks it up.
    // we attach reminders only when category === 'reminder' AND we have a
    // due_at — bare tasks just sit in loose-ends.
    if (item.category === 'reminder' && dueAt) {
      await createReminder({
        page_id: page.id,
        due_at: dueAt,
        text: item.title,
      });
      result.remindersCreated++;
    }
  }

  if (notes.length > 0) {
    const combined = notes
      .map((n) => n.text.trim())
      .filter(Boolean)
      .join('\n\n');
    if (combined) {
      const body = textToTiptapDoc(combined);
      const dateLabel = new Date(snap.created_at).toISOString().slice(0, 10);
      await createPage({
        type: 'note',
        title: `from journal · ${dateLabel}`,
        body,
        properties: { from_snap: snap.id } as unknown as TaskProperties,
      });
      result.notesCreated++;
    }
  }

  return result;
}

function textToTiptapDoc(text: string): TiptapDoc {
  const paragraphs = text.split(/\n\n+/);
  return {
    type: 'doc',
    content: paragraphs.map((p) => {
      const t = p.trim();
      if (!t) return { type: 'paragraph' };
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: t }],
      };
    }),
  };
}
