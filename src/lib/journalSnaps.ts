// ============================================================================
// journalSnaps — client-side helpers for the snap-and-extract flow.
//   - resizeToJpeg: client-side downscale + rotate so we don't upload 5 MB
//   - createSnap: upload to storage + insert journal_snaps row
//   - getSnap, getSnapPhotoUrl: read helpers for the status / confirm screens
//   - invokeExtraction: trigger the edge function (phase 5)
// ============================================================================

import { supabase } from './supabase';

export interface JournalSnap {
  id: string;
  owner_id: string;
  photo_storage_path: string;
  processed_at: string | null;
  raw_extraction: unknown | null;
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
