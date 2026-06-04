"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

type Props = {
  content: string;
  onChange: (html: string) => void;
  onImageFile: (file: File) => Promise<string>;
};

export default function NoteEditor({ content, onChange, onImageFile }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "写下你的分析和思考..." }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "tiptap-body focus:outline-none px-3 py-2 min-h-[80px] text-base text-gray-700 leading-relaxed" },
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.getHTML();
    if (current !== content) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  async function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const img = items.find(i => i.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    const file = img.getAsFile();
    if (!file) return;
    const src = await onImageFile(file);
    editor?.chain().focus().setImage({ src }).run();
  }

  async function handleDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    for (const file of files) {
      const src = await onImageFile(file);
      editor?.chain().focus().setImage({ src }).run();
    }
  }

  if (!editor) return null;

  return (
    <div
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
