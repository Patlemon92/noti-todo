import { supabase } from './supabase';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw error;
  if (!data) throw new Error('empty response from ' + name);
  return data;
}

export interface CapturedTask {
  title: string;
  body_text: string;
  suggested_board?: string;
}

export async function aiTaskCapture(text: string, defaultBoardId: string) {
  return invoke<{ tasks: CapturedTask[] }>('ai-task-capture', {
    text,
    default_board_id: defaultBoardId,
  });
}

export async function aiPullFromPage(pageId: string) {
  return invoke<{ tasks: CapturedTask[] }>('ai-pull-from-page', {
    page_id: pageId,
  });
}

export async function aiBreakDown(pageId: string) {
  return invoke<{ steps: string[] }>('ai-break-down', { page_id: pageId });
}

export async function aiStuck(pageId: string) {
  return invoke<{ response: string }>('ai-stuck', { page_id: pageId });
}

export async function aiAsk(pageId: string) {
  return invoke<{ response: string }>('ai-ask', { page_id: pageId });
}
