import { BubbleMenu, type Editor } from '@tiptap/react';
import clsx from 'clsx';

interface Props {
  editor: Editor;
}

export default function FloatingToolbar({ editor }: Props) {
  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={clsx(active && 'active')}
    >
      {children}
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: 'top',
        theme: 'noti',
        arrow: false,
        offset: [0, 6],
      }}
      shouldShow={({ editor, state }) => {
        const { from, to, empty } = state.selection;
        if (empty || from === to) return false;
        if (!editor.isEditable) return false;
        // hide in code blocks
        if (editor.isActive('codeBlock')) return false;
        return true;
      }}
    >
      <div className="floating-toolbar">
        <Btn
          title="bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </Btn>
        <Btn
          title="italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span style={{ fontStyle: 'italic' }}>I</span>
        </Btn>
        <Btn
          title="heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </Btn>
        <Btn
          title="heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </Btn>
        <Btn
          title="bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </Btn>
        <Btn
          title="link"
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('paste url');
            if (!url) return;
            if (url === ' ') {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange('link')
              .setLink({ href: url })
              .run();
          }}
        >
          🔗
        </Btn>
        <Btn
          title="link a page"
          onClick={() => editor.chain().focus().insertContent('@').run()}
        >
          @
        </Btn>
      </div>
    </BubbleMenu>
  );
}
