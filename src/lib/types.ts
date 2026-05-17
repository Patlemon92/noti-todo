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

export type RecurrenceRule = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface TaskRecurrence {
  rule: RecurrenceRule;
  /** For 'custom' — days between occurrences. */
  every_n_days?: number;
}

export interface TaskProperties {
  status?: TaskStatus;
  board_id?: string;
  column_id?: string;
  snoozed_until?: string;
  checklist?: ChecklistItem[];
  due_at?: string;
  estimated_minutes?: number;
  /** When set, completing the task spawns a new instance snoozed until the next occurrence. */
  recurrence?: TaskRecurrence;
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

export interface CanvasStroke {
  id: number;
  points: [number, number, number][];
  color: string;
  size: number;
  tool: 'pen' | 'highlighter';
}

export interface CanvasTextBox {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export interface CanvasImage {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** data:image/...;base64,... — kept inline for now (no supabase storage). */
  src: string;
}

export interface NotePage {
  id: number;
  /** Legacy plain text body — kept for migration. New saves write `body`. */
  text: string;
  /** Rich text body as a Tiptap doc (supports markdown shortcuts on input). */
  body?: TiptapDoc;
  strokes: CanvasStroke[];
  template: 'blank' | 'dotted' | 'lined' | 'grid';
  images?: CanvasImage[];
  /** Captured at save time so the SVG overlay aligns with the editor. */
  w?: number;
  h?: number;
}

export interface NoteCanvasData {
  /** Multi-page notebook. Always has at least one page. */
  pages?: NotePage[];
  /** Pre-rendered SVG of the first page for the list-view thumbnail. */
  svg: string;
  next_id: number;

  // ---- legacy single-page fields (pre-multipage). kept for migration. ----
  strokes?: CanvasStroke[];
  text_boxes?: CanvasTextBox[];
  template?: 'blank' | 'dotted' | 'lined' | 'grid';
  w?: number;
  h?: number;
}

export interface NoteProperties {
  canvas?: NoteCanvasData;
}

export type PageProperties =
  | TaskProperties
  | BoardProperties
  | NoteProperties
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
  deleted_at?: string | null;
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
  source_type: 'task_completed' | 'checklist_item' | 'session' | 'task_deleted';
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
