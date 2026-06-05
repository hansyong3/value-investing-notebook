"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
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
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "写下你的分析和思考..." }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "tiptap-body focus:outline-none px-5 py-2 min-h-[80px] text-base text-gray-700 leading-relaxed" },
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

  const isBold = editor.isActive("bold");

  return (
    <div
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Mini toolbar */}
      <div className="flex items-center gap-2 px-5 py-1 border-b border-gray-100">
        <button type="button"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
          className={`text-sm font-bold px-1.5 py-0.5 rounded transition-colors ${isBold ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
          title="加粗">B</button>
        <button type="button"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor("#dc2626").run(); }}
          className="text-sm font-medium px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 transition-colors"
          title="红色">A</button>
        <button type="button"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetAllMarks().run(); }}
          className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
          title="清除格式">清除</button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
