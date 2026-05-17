// Tiptap-backed editor with markdown shortcuts.
//   # heading           → h1
//   ## sub-heading      → h2
//   ### smaller heading → h3
//   - item              → bulleted list
//   1. item             → numbered list
//   > quote             → blockquote
//   ---                 → horizontal rule
//   **bold** *italic*   → marks
//   `code`              → inline code
//   ``` then enter      → code block
//
// All shortcuts are provided out-of-the-box by Tiptap's StarterKit InputRules.
//
// Storage: Tiptap JSON via getJSON(). We hand the caller the doc on every
// transaction and they auto-save it.

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import type { TiptapDoc } from '../../lib/types';
import { EMPTY_DOC } from '../../lib/types';

interface Props {
  initial?: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  /** When false, the editor doesn't capture pointer events (lets pen/eraser through). */
  pointerEnabled: boolean;
  placeholder?: string;
  /** Resets the editor when this changes (e.g. new page id). */
  resetKey?: string | number;
}

export default function MarkdownEditor({
  initial,
  onChange,
  pointerEnabled,
  placeholder,
  resetKey,
}: Props) {
  const lastSerialized = useRef<string>('');

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder ?? 'tap and type · # for heading · - for list · > for quote',
        }),
      ],
      content: (initial ?? EMPTY_DOC) as any,
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'md-editor',
          spellcheck: 'true',
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON() as TiptapDoc;
        const ser = JSON.stringify(json);
        if (ser === lastSerialized.current) return;
        lastSerialized.current = ser;
        onChange(json);
      },
    },
    [resetKey],
  );

  // Toggle pointer-events on the editor's contenteditable so other tools
  // (pen, eraser, lasso) can interact with the canvas through it.
  useEffect(() => {
    const el = editor?.view.dom as HTMLElement | undefined;
    if (!el) return;
    el.style.pointerEvents = pointerEnabled ? 'auto' : 'none';
  }, [editor, pointerEnabled]);

  return <EditorContent editor={editor} />;
}
