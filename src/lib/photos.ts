import { supabase } from './supabase';

// Photos ride on page_actions with type='image'. payload:
//   { src: data-url, w: number, h: number, caption?: string }

export interface PhotoPayload {
  src: string;
  w: number;
  h: number;
  caption?: string;
}

export interface Photo {
  id: string;
  page_id: string;
  payload: PhotoPayload;
  created_at: string;
}

export async function createPhoto(input: {
  page_id: string;
  src: string;
  w: number;
  h: number;
  caption?: string;
}): Promise<Photo> {
  const { data, error } = await supabase
    .from('page_actions')
    .insert({
      page_id: input.page_id,
      type: 'image',
      payload: {
        src: input.src,
        w: input.w,
        h: input.h,
        caption: input.caption,
      } satisfies PhotoPayload,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Photo;
}

export async function listPhotos(pageId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('page_actions')
    .select('*')
    .eq('page_id', pageId)
    .eq('type', 'image')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Photo[];
}

export async function deletePhoto(id: string): Promise<void> {
  const { error } = await supabase.from('page_actions').delete().eq('id', id);
  if (error) throw error;
}
