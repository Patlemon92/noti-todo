import { supabase } from './supabase';

// Sketches ride on page_actions with type='sketch'. payload shape:
//   {
//     svg: string,    — serialized <svg> element to render
//     w: number,      — natural width
//     h: number       — natural height
//   }

export type PaperTemplate = 'blank' | 'dotted' | 'lined' | 'grid';

export interface SketchPayload {
  svg: string;
  w: number;
  h: number;
  template?: PaperTemplate;
}

export interface Sketch {
  id: string;
  page_id: string;
  payload: SketchPayload;
  created_at: string;
}

export async function createSketch(input: {
  page_id: string;
  svg: string;
  w: number;
  h: number;
  template?: PaperTemplate;
}): Promise<Sketch> {
  const { data, error } = await supabase
    .from('page_actions')
    .insert({
      page_id: input.page_id,
      type: 'sketch',
      payload: {
        svg: input.svg,
        w: input.w,
        h: input.h,
        template: input.template,
      } satisfies SketchPayload,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Sketch;
}

export async function listSketches(pageId: string): Promise<Sketch[]> {
  const { data, error } = await supabase
    .from('page_actions')
    .select('*')
    .eq('page_id', pageId)
    .eq('type', 'sketch')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Sketch[];
}

export async function deleteSketch(id: string): Promise<void> {
  const { error } = await supabase.from('page_actions').delete().eq('id', id);
  if (error) throw error;
}
