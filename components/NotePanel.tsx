"use client";
import { useEffect, useRef, useState } from "react";

type NoteImage = { id: number; url: string };
type Note = {
  id: number;
  date: string;
  content: string;
  images: NoteImage[];
};

type Props = {
  symbol: string;
  notes: Note[];
  activeDate: string | null;
  onNotesSaved: () => void;
};

export default function NotePanel({ symbol, notes, activeDate, onNotesSaved }: Props) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [newNoteDate, setNewNoteDate] = useState("");
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to active date when crosshair moves
  useEffect(() => {
    if (!activeDate) return;
    // Find closest note by month
    const ym = activeDate.slice(0, 7);
    const closest = notes.find((n) => n.date.startsWith(ym)) ?? notes.findLast((n) => n.date <= activeDate);
    if (closest && noteRefs.current[closest.date]) {
      noteRefs.current[closest.date]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeDate, notes]);

  async function saveNote(date: string) {
    setSaving(true);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date, content: editContent }),
    });
    setSaving(false);
    setEditingDate(null);
    onNotesSaved();
  }

  async function uploadImage(noteId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("noteId", String(noteId));
    await fetch("/api/upload", { method: "POST", body: form });
    onNotesSaved();
  }

  function isHighlighted(note: Note) {
    if (!activeDate) return false;
    return note.date.slice(0, 7) === activeDate.slice(0, 7);
  }

  async function addNewNote() {
    if (!newNoteDate) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date: newNoteDate, content: "" }),
    });
    setNewNoteDate("");
    onNotesSaved();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <input
          type="date"
          value={newNoteDate}
          onChange={(e) => setNewNoteDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={addNewNote}
          disabled={!newNoteDate}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors"
        >
          + 添加笔记
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {notes.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">还没有笔记，选择日期添加第一条</p>
        )}

        {[...notes].reverse().map((note) => (
          <div
            key={note.id}
            ref={(el) => { noteRefs.current[note.date] = el; }}
            className={`rounded-xl border p-4 transition-all duration-300 ${
              isHighlighted(note)
                ? "border-blue-500 bg-blue-950/30 shadow-lg shadow-blue-900/20"
                : "border-gray-800 bg-gray-900"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${isHighlighted(note) ? "text-blue-400" : "text-gray-400"}`}>
                {note.date}
              </span>
              <button
                onClick={() => {
                  setEditingDate(note.date);
                  setEditContent(note.content);
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                编辑
              </button>
            </div>

            {editingDate === note.date ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="记录你的分析思考..."
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveNote(note.date)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded transition-colors"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button
                    onClick={() => setEditingDate(null)}
                    className="text-gray-500 hover:text-gray-300 text-xs px-3 py-1.5 rounded transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                {note.content || <span className="text-gray-600 italic">空笔记，点击编辑</span>}
              </p>
            )}

            {note.images.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {note.images.map((img) => (
                  <img key={img.id} src={img.url} alt="" className="rounded-lg w-full object-cover max-h-40" />
                ))}
              </div>
            )}

            {note.id && (
              <label className="mt-3 flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                上传图片
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(note.id, file);
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
