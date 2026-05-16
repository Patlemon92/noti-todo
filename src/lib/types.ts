// Mirrors the Postgres schema in supabase/migrations/001_initial_schema.sql

export type PageType = 'task' | 'note' | 'board' | 'plain';

export type TaskStatus = 'today' | 'doing' | 'waiting' | 'done';

export type PastelColor =
  | 'peach'
  | 'butter'
  | 'mint'
  | 'lavender'
  | 'sky'
  | 'rose';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  done_at?: string;
}

export interface TaskProperties {
  status?: TaskStatus;
  board_id?: string;
  column_id?: string;
  snoozed_until?: string;
  checklist?: ChecklistItem[];
  due_at?: string;
  estimated_minutes?: number;
}

export interface BoardColumn {
  id: string;
  name: string;
  color: PastelColor;
  sort_order: number;
}

export interface BoardProperties {
  color?: PastelColor;
  columns?: BoardColumn[];
}

export type PageProperties =
  | TaskProperties
  | BoardProperties
  | Record<string, never>;

// Tiptap stores docs as { type: 'doc', content: [...] }
export interface TiptapDoc {
  type: 'doc';
  content?: unknown[];
}

export const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [] };

export interface Page {
  id: string;
  owner_id: string;
  parent_id: string | null;
  type: PageType;
  title: string;
  body: TiptapDoc;
  body_text?: string | null;
  properties: PageProperties;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PageLink {
  id: string;
  source_page_id: string;
  target_page_id: string;
  created_at: string;
}

export interface PageAction {
  id: string;
  page_id: string;
  type: 'timer' | 'reminder' | 'url_link' | 'image' | 'snooze' | 'delegate';
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Win {
  id: string;
  user_id: string;
  source_type: 'task_completed' | 'checklist_item' | 'session';
  source_id: string;
  text: string;
  occurred_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  created_at: string;
}

export const DEFAULT_BOARD_COLUMNS: BoardColumn[] = [
  { id: 'today', name: 'today', color: 'peach', sort_order: 0 },
  { id: 'doing', name: 'doing', color: 'butter', sort_order: 1 },
  { id: 'waiting', name: 'waiting', color: 'lavender', sort_order: 2 },
  { id: 'done', name: 'done', color: 'mint', sort_order: 3 },
];
