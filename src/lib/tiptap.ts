import type { TiptapDoc } from './types';

export function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  if (!doc) return true;
  if (!Array.isArray(doc.content) || doc.content.length === 0) return true;
  // doc with a single empty paragraph counts as empty
  if (doc.content.length === 1) {
    const node = doc.content[0] as { type?: string; content?: unknown[] };
    if (
      node.type === 'paragraph' &&
      (!Array.isArray(node.content) || node.content.length === 0)
    ) {
      return true;
    }
  }
  return false;
}

/** Client-side plaintext for previews/snippets; mirrors the SQL version. */
export function docToPlaintext(doc: TiptapDoc | null | undefined): string {
  if (!doc) return '';
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === 'string') out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(visit);
  };
  visit(doc);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function snippet(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + '…';
}
