import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance, type Props as TippyProps } from 'tippy.js';
import SuggestList, {
  type SuggestListHandle,
  type SuggestItem,
} from '../SuggestList';
import { searchPagesByTitle, createPage } from '../../../lib/db';

export interface PageMentionOptions {
  HTMLAttributes: Record<string, unknown>;
  suggestion: Omit<SuggestionOptions, 'editor'>;
  onNavigate?: (pageId: string) => void;
}

export const PageMention = Node.create<PageMentionOptions>({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      // populated in extension instantiation
      suggestion: {} as Omit<SuggestionOptions, 'editor'>,
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-mention-id'),
        renderHTML: (attrs: { id?: string | null }) =>
          attrs.id ? { 'data-mention-id': attrs.id } : {},
      },
      label: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-mention-label'),
        renderHTML: (attrs: { label?: string | null }) =>
          attrs.label ? { 'data-mention-label': attrs.label } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-mention-id]' }];
  },

  renderHTML(args) {
    const { HTMLAttributes, node } = args as {
      HTMLAttributes: Record<string, string>;
      node: { attrs: { id?: string | null; label?: string | null } };
    };
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'mention-pill',
        href: HTMLAttributes['data-mention-id']
          ? `/page/${HTMLAttributes['data-mention-id']}`
          : '#',
      }),
      node.attrs.label ?? 'page',
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        allowSpaces: true,
        startOfLine: false,
        pluginKey: new PluginKey('pageMentionAt'),
        ...this.options.suggestion,
      }),
      Suggestion({
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        startOfLine: false,
        pluginKey: new PluginKey('pageMentionBracket'),
        ...this.options.suggestion,
      }),
    ];
  },
});

/** Build the suggestion config used by PageMention. */
export function makePageMentionSuggestion(): Omit<SuggestionOptions, 'editor'> {
  return {
    items: async ({ query }: { query: string }) => {
      try {
        const pages = await searchPagesByTitle(query, 8);
        const items: SuggestItem[] = pages.map((p) => ({
          key: p.id,
          label: p.title || 'untitled',
          desc: p.type.toUpperCase(),
          onSelect: () => {},
        }));
        if (query.trim().length > 0) {
          items.push({
            key: `__create__:${query.trim()}`,
            label: `+ create "${query.trim()}"`,
            desc: 'NEW PAGE',
            onSelect: () => {},
          });
        }
        return items;
      } catch (err) {
        // surface failure as empty result; the popup just shows "no matches"
        // eslint-disable-next-line no-console
        console.error('[pageMention search]', err);
        return [];
      }
    },
    render: () => {
      let component: ReactRenderer<SuggestListHandle> | null = null;
      let popup: Instance<TippyProps>[] = [];

      const select = async (
        item: SuggestItem,
        props: { editor: any; range: any },
      ) => {
        const { editor, range } = props;
        let pageId = item.key;
        let label = item.label;

        if (pageId.startsWith('__create__:')) {
          const title = pageId.replace('__create__:', '');
          try {
            const page = await createPage({ type: 'note', title });
            pageId = page.id;
            label = page.title || title;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[pageMention create]', err);
            return;
          }
        }

        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'pageMention',
              attrs: { id: pageId, label },
            },
            { type: 'text', text: ' ' },
          ])
          .run();
      };

      return {
        onStart: (props) => {
          // Bind onSelect callbacks now that we have editor + range
          const items = (props.items as SuggestItem[]).map((it) => ({
            ...it,
            onSelect: () =>
              select(it, { editor: props.editor, range: props.range }),
          }));
          component = new ReactRenderer(SuggestList, {
            props: { items },
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
            onSelect: () =>
              select(it, { editor: props.editor, range: props.range }),
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
