import { supabase } from './supabase';
import {
  type Page,
  type PageType,
  type PageProperties,
  type TiptapDoc,
  type ChecklistItem,
  type Win,
  type PageLink,
  EMPTY_DOC,
} from './types';

const PAGE_COLS =
  'id,owner_id,parent_id,type,title,body,body_text,properties,sort_order,archived,created_at,updated_at,completed_at';

export async function getPage(id: string): Promise<Page | null> {
  const { data, error } = await supabase
    .from('pages')
    .select(PAGE_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Page | null;
}

export async function listPages(opts: {
  type?: PageType | PageType[];
  parent_id?: string | null;
  archived?: boolean;
  limit?: number;
} = {}): Promise<Page[]> {
  let q = supabase.from('pages').select(PAGE_COLS);
  if (opts.archived === undefined) q = q.eq('archived', false);
  else q = q.eq('archived', opts.archived);
  if (opts.type) {
    if (Array.isArray(opts.type)) q = q.in('type', opts.type);
    else q = q.eq('type', opts.type);
  }
  if (opts.parent_id !== undefined) {
    q = opts.parent_id === null
      ? q.is('parent_id', null)
      : q.eq('parent_id', opts.parent_id);
  }
  if (opts.limit) q = q.limit(opts.limit);
  q = q.order('updated_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Page[];
}

export async function searchPagesByTitle(query: string, limit = 8): Promise<Page[]> {
  if (!query.trim()) {
    const { data, error } = await supabase
      .from('pages')
      .select(PAGE_COLS)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Page[];
  }
  const { data, error } = await supabase
    .from('pages')
    .select(PAGE_COLS)
    .eq('archived', false)
    .ilike('title', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Page[];
}

export async function createPage(
  input: {
    type: PageType;
    title?: string;
    body?: TiptapDoc;
    parent_id?: string | null;
    properties?: PageProperties;
    sort_order?: number;
  },
): Promise<Page> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('pages')
    .insert({
      owner_id: userId,
      type: input.type,
      title: input.title ?? '',
      body: input.body ?? EMPTY_DOC,
      parent_id: input.parent_id ?? null,
      properties: input.properties ?? {},
      sort_order: input.sort_order ?? 0,
    })
    .select(PAGE_COLS)
    .single();
  if (error) throw error;
  return data as Page;
}

export async function updatePage(
  id: string,
  patch: Partial<Pick<Page, 'title' | 'body' | 'properties' | 'parent_id' | 'sort_order' | 'archived' | 'type' | 'completed_at'>>,
): Promise<void> {
  const { error } = await supabase.from('pages').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deletePage(id: string): Promise<void> {
  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) throw error;
}

export async function listChildPages(parentId: string): Promise<Page[]> {
  return listPages({ parent_id: parentId });
}

export async function listBacklinks(targetId: string): Promise<Page[]> {
  const { data, error } = await supabase
    .from('page_links')
    .select(`source:pages!page_links_source_page_id_fkey(${PAGE_COLS})`)
    .eq('target_page_id', targetId);
  if (error) throw error;
  // PostgREST may return the joined row as object or array depending on FK shape.
  return ((data ?? []) as unknown as Array<{ source: Page | Page[] | null }>)
    .flatMap((r) => (Array.isArray(r.source) ? r.source : r.source ? [r.source] : []));
}

export async function listBoards(): Promise<Page[]> {
  return listPages({ type: 'board' });
}

export async function getDefaultBoard(): Promise<Page | null> {
  const boards = await listBoards();
  return boards[0] ?? null;
}

export async function listBoardTasks(boardId: string): Promise<Page[]> {
  return listPages({ parent_id: boardId, type: 'task' });
}

/**
 * Stage 1+2 focus heuristic: open tasks, not snoozed past now, recently-touched
 * first then oldest. Snooze lives in properties.snoozed_until (jsonb), so we
 * filter that client-side rather than fighting PostgREST.
 */
export async function nextFocusCandidates(limit = 8): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select(PAGE_COLS)
    .eq('type', 'task')
    .eq('archived', false)
    .is('completed_at', null)
    .limit(100);
  if (error) throw error;

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const pages = ((data ?? []) as Page[]).filter((p) => {
    const snoozedUntil =
      (p.properties as { snoozed_until?: string } | undefined)?.snoozed_until;
    if (!snoozedUntil) return true;
    const t = Date.parse(snoozedUntil);
    return Number.isNaN(t) || t <= now;
  });

  pages.sort((a, b) => {
    const ar = new Date(a.updated_at).getTime() >= dayAgo ? 0 : 1;
    const br = new Date(b.updated_at).getTime() >= dayAgo ? 0 : 1;
    if (ar !== br) return ar - br;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  return pages.slice(0, limit);
}

export async function listTodaysWins(): Promise<Win[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('wins')
    .select('*')
    .gte('occurred_at', startOfDay.toISOString())
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Win[];
}

export async function recordWin(input: {
  source_type: Win['source_type'];
  source_id: string;
  text: string;
}): Promise<Win> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('wins')
    .insert({
      user_id: userId,
      source_type: input.source_type,
      source_id: input.source_id,
      text: input.text,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Win;
}

export async function completeTask(pageId: string, title: string): Promise<void> {
  await updatePage(pageId, { completed_at: new Date().toISOString() });
  await recordWin({
    source_type: 'task_completed',
    source_id: pageId,
    text: title,
  });
}

export function toggleChecklistItem(
  checklist: ChecklistItem[] | undefined,
  itemId: string,
): { next: ChecklistItem[]; toggled: ChecklistItem | null } {
  const list = checklist ?? [];
  let toggled: ChecklistItem | null = null;
  const next = list.map((it) => {
    if (it.id !== itemId) return it;
    const now = !it.done;
    const updated: ChecklistItem = {
      ...it,
      done: now,
      done_at: now ? new Date().toISOString() : undefined,
    };
    toggled = updated;
    return updated;
  });
  return { next, toggled };
}

export async function addPageLink(sourceId: string, targetId: string): Promise<void> {
  await supabase
    .from('page_links')
    .upsert(
      { source_page_id: sourceId, target_page_id: targetId },
      { onConflict: 'source_page_id,target_page_id', ignoreDuplicates: true },
    );
}

export type { PageLink };
