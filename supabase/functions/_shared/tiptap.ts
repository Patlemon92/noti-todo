// Mirror of the client's tiptap → plaintext for use inside edge functions.

export function docToPlaintext(doc: unknown): string {
  if (!doc) return '';
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === 'string') out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(visit);
  };
  visit(doc);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
