import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import 'tippy.js/dist/tippy.css';

import { PageMention, makePageMentionSuggestion } from './extensions/PageMention';
import { SlashMenu, makeSlashSuggestion } from './extensions/SlashMenu';
import FloatingToolbar from './FloatingToolbar';
import type { TiptapDoc } from '../../lib/types';
import { EMPTY_DOC } from '../../lib/types';

interface Props {
  pageId: string;
  initialBody: TiptapDoc | null | undefined;
  onSave: (body: TiptapDoc) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function PageEditor({
  pageId,
  initialBody,
  onSave,
  placeholder = 'write anything…',
  autoFocus = false,
}: Props) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimer = useRef<number | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(initialBody ?? EMPTY_DOC));
  const onSaveRef = useRef(onSave);
  const navigate = useNavigate();

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: { HTMLAttributes: { class: 'noti-codeblock' } },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        }),
        Placeholder.configure({ placeholder }),
        TaskList,
        TaskItem.configure({ nested: true }),
        PageMention.configure({
          suggestion: makePageMentionSuggestion(),
        }),
        SlashMenu.configure({
          suggestion: makeSlashSuggestion(),
        }),
      ],
      content: (initialBody ?? EMPTY_DOC) as any,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: 'tiptap',
          spellcheck: 'true',
        },
        handleClickOn(_view, _pos, node, _nodePos, event) {
          // Navigate when a mention pill is tapped
          if (node.type.name === 'pageMention') {
            const id = node.attrs.id as string | null;
            if (id) {
              event.preventDefault();
              navigate(`/page/${id}`);
              return true;
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON() as TiptapDoc;
        const serialized = JSON.stringify(json);
        if (serialized === lastSaved.current) return;
        setSaveState('dirty');
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          flush(json);
        }, 500);
      },
    },
    [pageId],
  );

  // When pageId changes, reset content + saved snapshot
  useEffect(() => {
    if (!editor) return;
    const incoming = initialBody ?? EMPTY_DOC;
    const incomingSer = JSON.stringify(incoming);
    if (incomingSer !== lastSaved.current) {
      editor.commands.setContent(incoming as any, false);
      lastSaved.current = incomingSer;
      setSaveState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, editor]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (editor && saveState === 'dirty') {
        const json = editor.getJSON() as TiptapDoc;
        void onSaveRef.current(json);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush(json: TiptapDoc) {
    setSaveState('saving');
    try {
      await onSaveRef.current(json);
      lastSaved.current = JSON.stringify(json);
      setSaveState('saved');
      window.setTimeout(() => {
        setSaveState((s) => (s === 'saved' ? 'idle' : s));
      }, 1400);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PageEditor save]', err);
      setSaveState('error');
    }
  }

  return (
    <div className="relative">
      {editor && <FloatingToolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div className="pointer-events-none fixed bottom-[14px] left-[14px] z-40 select-none">
        <SaveIndicator state={saveState} />
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label =
    state === 'dirty'
      ? '•'
      : state === 'saving'
        ? 'saving…'
        : state === 'saved'
          ? 'saved ✓'
          : 'save failed';
  return (
    <span
      className={clsx(
        'rounded-full border border-ink-faint bg-bg-soft/90 px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft transition-opacity',
        state === 'error' && 'border-rose-deep text-rose-deep',
      )}
    >
      {label}
    </span>
  );
}
