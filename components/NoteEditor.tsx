"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";

type Props = {
  content: string; // HTML string
  onChange: (html: string) => void;
  onImagePaste: (file: File) => Promise<string>; // returns data URL
  expanded: boolean;
};

export default function NoteEditor({ content, onChange, onImagePaste, expanded }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "写下你的分析和思考...（可在任意位置粘贴或拖入图片）" }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-gray-700 leading-relaxed",
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find(i => i.type.startsWith("image/"));
        if (!imageItem) return false;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return true;
        onImagePaste(file).then(dataUrl => {
          view.dispatch(view.state.tr.replaceSelectionWith(
            view.state.schema.nodes.image.create({ src: dataUrl })
          ));
        });
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        files.forEach(file => {
          onImagePaste(file).then(dataUrl => {
            const node = view.state.schema.nodes.image.create({ src: dataUrl });
            const transaction = view.state.tr.insert(pos?.pos ?? 0, node);
            view.dispatch(transaction);
          });
        });
        return true;
      },
    },
  });

  // Sync content when note changes (e.g. switching notes)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== content && !editor.isFocused) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={`overflow-y-auto transition-all duration-200 ${expanded ? "min-h-40 max-h-[600px]" : "max-h-28 overflow-hidden"}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
