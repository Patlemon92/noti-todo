import { supabase } from './supabase';

// Sketches ride on page_actions with type='sketch'. payload shape:
//   {
//     svg: string,    — serialized <svg> element to render
//     w: number,      — natural width
//     h: number       — natural height
//   }

import type { CanvasStroke, CanvasTextBox } from './types';

export type PaperTemplate = 'blank' | 'dotted' | 'lined' | 'grid';

export interface SketchPayload {
  svg: string;
  w: number;
  h: number;
  template?: PaperTemplate;
  /** Raw stroke + text data so we can re-open the sketch for editing later. */
  strokes?: CanvasStroke[];
  text_boxes?: CanvasTextBox[];
  next_id?: number;
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
  strokes?: CanvasStroke[];
  text_boxes?: CanvasTextBox[];
  next_id?: number;
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
        strokes: input.strokes,
        text_boxes: input.text_boxes,
        next_id: input.next_id,
      } satisfies SketchPayload,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Sketch;
}

export async function updateSketch(
  id: string,
  patch: {
    svg: string;
    w: number;
    h: number;
    template?: PaperTemplate;
    strokes?: CanvasStroke[];
    text_boxes?: CanvasTextBox[];
    next_id?: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from('page_actions')
    .update({
      payload: {
        svg: patch.svg,
        w: patch.w,
        h: patch.h,
        template: patch.template,
        strokes: patch.strokes,
        text_boxes: patch.text_boxes,
        next_id: patch.next_id,
      } satisfies SketchPayload,
    })
    .eq('id', id);
  if (error) throw error;
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
