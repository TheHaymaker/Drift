import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Minimap from './Minimap.jsx';

// ── Build extensions list ────────────────────────────────────────────────────

function buildExtensions(placeholderText) {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
    }),
    Placeholder.configure({ placeholder: placeholderText || 'begin writing...' }),
    Typography,
    Underline,
    Subscript,
    Superscript,
  ];
}

// ── Bubble menu button ───────────────────────────────────────────────────────

function BubbleBtn({ editor, name, command, label, title }) {
  return (
    <button
      className={`bubble-btn ${editor.isActive(name) ? 'is-active' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        command();
      }}
      title={title}
    >
      {label}
    </button>
  );
}

// ── Custom floating bubble menu ──────────────────────────────────────────────

function FloatingBubbleMenu({ editor }) {
  const menuRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!editor) return;

    const updateMenu = () => {
      const { state, view } = editor;
      const { selection } = state;
      const { empty } = selection;

      if (empty || !view.hasFocus()) {
        setVisible(false);
        return;
      }

      // Get bounding rect of the selection
      const { from, to } = selection;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      // Position above the selection, centered
      const menuEl = menuRef.current;
      if (!menuEl) return;

      const menuWidth = menuEl.offsetWidth || 200;
      const left = (start.left + end.right) / 2 - menuWidth / 2;
      const top = start.top - 40;

      setPos({ top, left: Math.max(8, left) });
      setVisible(true);
    };

    editor.on('selectionUpdate', updateMenu);
    editor.on('blur', () => setVisible(false));
    editor.on('focus', updateMenu);

    return () => {
      editor.off('selectionUpdate', updateMenu);
      editor.off('blur', () => setVisible(false));
      editor.off('focus', updateMenu);
    };
  }, [editor]);

  // Also update on transaction to reflect active state changes
  useEffect(() => {
    if (!editor) return;
    const onTx = () => {
      if (editor.state.selection.empty || !editor.view.hasFocus()) {
        setVisible(false);
      }
    };
    editor.on('transaction', onTx);
    return () => editor.off('transaction', onTx);
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      ref={menuRef}
      className="bubble-menu"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.15s',
        zIndex: 1000,
      }}
    >
      <BubbleBtn
        editor={editor}
        name="bold"
        command={() => editor.chain().focus().toggleBold().run()}
        label="B"
        title="Bold (Ctrl+B)"
      />
      <BubbleBtn
        editor={editor}
        name="italic"
        command={() => editor.chain().focus().toggleItalic().run()}
        label="I"
        title="Italic (Ctrl+I)"
      />
      <BubbleBtn
        editor={editor}
        name="underline"
        command={() => editor.chain().focus().toggleUnderline().run()}
        label="U"
        title="Underline (Ctrl+U)"
      />
      <BubbleBtn
        editor={editor}
        name="strike"
        command={() => editor.chain().focus().toggleStrike().run()}
        label="S"
        title="Strikethrough (Ctrl+Shift+S)"
      />
      <span className="bubble-sep" />
      <BubbleBtn
        editor={editor}
        name="superscript"
        command={() => editor.chain().focus().toggleSuperscript().run()}
        label={<>X<sup>2</sup></>}
        title="Superscript"
      />
      <BubbleBtn
        editor={editor}
        name="subscript"
        command={() => editor.chain().focus().toggleSubscript().run()}
        label={<>X<sub>2</sub></>}
        title="Subscript"
      />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RichTextEditor({
  content,
  onUpdate,
  placeholder,
  autoFocus = false,
  className = '',
  editable = true,
  showMinimap = false,
}) {
  const editor = useEditor({
    extensions: buildExtensions(placeholder),
    content,
    editable,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: ed }) => {
      onUpdate?.(ed.getHTML(), ed.getText('\n'));
    },
  });

  // Sync external content changes (e.g. loading a snapshot)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Sync editable state
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className={`rich-editor-wrap ${className}`}>
      <FloatingBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
      {showMinimap && <Minimap editor={editor} />}
    </div>
  );
}
