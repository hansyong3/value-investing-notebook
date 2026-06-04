"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type NoteImage = { id: number; url: string };
type Note = { id: number; date: string; content: string; images: NoteImage[] };

type Props = {
  symbol: string;
  notes: Note[];
  activeDate: string | null;
  onNotesSaved: () => void;
};

export default function NotePanel({ symbol, notes, activeDate, onNotesSaved }: Props) {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editingDates = useRef<Set<string>>(new Set()); // track dates currently being edited

  // Sync contents from server — but don't overwrite what user is actively editing
  useEffect(() => {
    setContents((prev) => {
      const next = { ...prev };
      for (const n of notes) {
        if (!editingDates.current.has(n.date)) {
          next[n.date] = n.content;
        }
      }
      return next;
    });
  }, [notes]);

  // Scroll to active date when crosshair moves
  useEffect(() => {
    if (!activeDate) return;
    const ym = activeDate.slice(0, 7);
    const closest = notes.find((n) => n.date.startsWith(ym)) ?? [...notes].reverse().find((n) => n.date <= activeDate);
    if (closest && noteRefs.current[closest.date]) {
      noteRefs.current[closest.date]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeDate, notes]);

  const saveNote = useCallback(async (date: string, content: string) => {
    setSaving((s) => ({ ...s, [date]: true }));
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date, content }),
    });
    setSaving((s) => ({ ...s, [date]: false }));
    editingDates.current.delete(date);
    onNotesSaved();
  }, [symbol, onNotesSaved]);

  function handleChange(date: string, value: string) {
    editingDates.current.add(date);
    setContents((c) => ({ ...c, [date]: value }));
    clearTimeout(saveTimers.current[date]);
    saveTimers.current[date] = setTimeout(() => saveNote(date, value), 1500);
  }

  async function uploadImage(noteId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("noteId", String(noteId));
    await fetch("/api/upload", { method: "POST", body: form });
    onNotesSaved();
  }

  async function addNewNote() {
    setAdding(true);
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date: today, content: "" }),
    });
    setAdding(false);
    await onNotesSaved();
    // Scroll to top to show the new note (newest first)
    setTimeout(() => listRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
  }

  function isHighlighted(note: Note) {
    if (!activeDate) return false;
    return note.date.slice(0, 7) === activeDate.slice(0, 7);
  }

  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <span className="text-sm text-gray-500">研究笔记</span>
        <button
          onClick={addNewNote}
          disabled={adding}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors"
        >
          {adding ? "创建中..." : "+ 添加笔记"}
        </button>
      </div>

      {/* Notes list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {sorted.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-10">还没有笔记，点击「添加笔记」开始记录</p>
        )}

        {sorted.map((note) => (
          <div
            key={note.id}
            ref={(el) => { noteRefs.current[note.date] = el; }}
            className={`rounded-xl border bg-white transition-all duration-300 overflow-hidden ${
              isHighlighted(note)
                ? "border-blue-400 shadow-md shadow-blue-100 ring-1 ring-blue-300"
                : "border-gray-200 shadow-sm"
            }`}
          >
            {/* Date row */}
            <div className={`flex items-center justify-between px-3 py-2 border-b ${
              isHighlighted(note) ? "border-blue-100 bg-blue-50" : "border-gray-100 bg-gray-50"
            }`}>
              <span className={`text-xs font-semibold ${isHighlighted(note) ? "text-blue-600" : "text-gray-500"}`}>
                {note.date}
              </span>
              {saving[note.date] && <span className="text-xs text-gray-400">保存中...</span>}
            </div>

            {/* Editable content */}
            <textarea
              value={contents[note.date] ?? ""}
              onChange={(e) => handleChange(note.date, e.target.value)}
              rows={4}
              placeholder="写下你的分析和思考..."
              className="w-full px-3 py-2.5 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none bg-white placeholder-gray-300"
            />

            {/* Images */}
            {note.images.length > 0 && (
              <div className="px-3 pb-2 grid grid-cols-2 gap-2">
                {note.images.map((img) => (
                  <img key={img.id} src={img.url} alt="" className="rounded-lg w-full object-cover max-h-36" />
                ))}
              </div>
            )}

            {/* Upload image */}
            <label className="flex items-center gap-1.5 px-3 pb-2.5 text-xs text-gray-300 hover:text-gray-500 cursor-pointer transition-colors w-fit">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              上传图片
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(note.id, f); }} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
