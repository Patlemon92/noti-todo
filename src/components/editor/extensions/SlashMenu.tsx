import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance, type Props as TippyProps } from 'tippy.js';
import SuggestList, {
  type SuggestListHandle,
  type SuggestItem,
} from '../SuggestList';

type Cmd = {
  key: string;
  label: string;
  desc?: string;
  icon?: string;
  run: (args: { editor: any; range: any }) => void;
  keywords: string[];
};

const COMMANDS: Cmd[] = [
  {
    key: 'h1',
    label: 'heading 1',
    desc: '#',
    icon: 'H1',
    keywords: ['h1', 'heading', 'title'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    key: 'h2',
    label: 'heading 2',
    desc: '##',
    icon: 'H2',
    keywords: ['h2', 'heading', 'sub'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    key: 'bullet',
    label: 'bullet list',
    desc: '-',
    icon: '•',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: 'tasklist',
    label: 'task list',
    desc: '[]',
    icon: '▢',
    keywords: ['task', 'todo', 'check', 'checklist'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: 'quote',
    label: 'quote',
    desc: '>',
    icon: '"',
    keywords: ['quote', 'blockquote'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    key: 'code',
    label: 'code block',
    desc: '```',
    icon: '<>',
    keywords: ['code', 'pre', 'monospace'],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    key: 'page-link',
    label: 'link to page',
    desc: '@',
    icon: '@',
    keywords: ['link', 'page', 'mention', 'ref'],
    run: ({ editor, range }) => {
      // delete the "/query" and trigger the @ suggestion
      editor.chain().focus().deleteRange(range).insertContent('@').run();
    },
  },
];

export interface SlashMenuOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions() {
    return {
      suggestion: {} as Omit<SuggestionOptions, 'editor'>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        pluginKey: new PluginKey('slashMenu'),
        ...this.options.suggestion,
      }),
    ];
  },
});

export function makeSlashSuggestion(): Omit<SuggestionOptions, 'editor'> {
  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase().trim();
      const filtered = q
        ? COMMANDS.filter((c) =>
            c.keywords.some((k) => k.includes(q)) ||
            c.label.toLowerCase().includes(q),
          )
        : COMMANDS;
      return filtered.map<SuggestItem>((c) => ({
        key: c.key,
        label: c.label,
        desc: c.desc,
        icon: c.icon,
        onSelect: () => {}, // bound at render time
      }));
    },
    render: () => {
      let component: ReactRenderer<SuggestListHandle> | null = null;
      let popup: Instance<TippyProps>[] = [];

      const itemFor = (key: string) => COMMANDS.find((c) => c.key === key);

      return {
        onStart: (props) => {
          const items = (props.items as SuggestItem[]).map((it) => ({
            ...it,
            onSelect: () => {
              const cmd = itemFor(it.key);
              cmd?.run({ editor: props.editor, range: props.range });
            },
          }));
          component = new ReactRenderer(SuggestList, {
            props: { items, empty: 'no commands' },
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy('body', {
            getReferenceClientRect: () =>
              (props.clientRect?.() as DOMRect) ?? new DOMRect(),
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            theme: 'noti',
            arrow: false,
            offset: [0, 6],
          });
        },
        onUpdate: (props) => {
          const items = (props.items as SuggestItem[]).map((it) => ({
            ...it,
            onSelect: () => {
              const cmd = itemFor(it.key);
              cmd?.run({ editor: props.editor, range: props.range });
            },
          }));
          component?.updateProps({ items });
          if (!props.clientRect) return;
          popup[0]?.setProps({
            getReferenceClientRect: () =>
              (props.clientRect?.() as DOMRect) ?? new DOMRect(),
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown({ event: props.event }) ?? false;
        },
        onExit: () => {
          popup[0]?.destroy();
          component?.destroy();
          popup = [];
          component = null;
        },
      };
    },
  };
}
