"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type NoteImage = { id: number; url: string };
type Note = { id: number; date: string; content: string; images: NoteImage[]; createdAt?: string };

type Props = {
  symbol: string;
  notes: Note[];
  activeDate: string | null;
  onNotesSaved: () => void;
};

const COLLAPSED_ROWS = 3;

export default function NotePanel({ symbol, notes, activeDate, onNotesSaved }: Props) {
  const [contents, setContents] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Sync contents from server (keyed by id, not date)
  useEffect(() => {
    setContents((prev) => {
      const next = { ...prev };
      for (const n of notes) {
        if (!(n.id in next)) next[n.id] = n.content;
      }
      return next;
    });
  }, [notes]);

  // Scroll to active date
  useEffect(() => {
    if (!activeDate) return;
    const ym = activeDate.slice(0, 7);
    const closest = [...notes].reverse().find((n) => n.date <= activeDate && n.date.slice(0, 7) >= ym.slice(0, 7))
      ?? notes[notes.length - 1];
    if (closest && noteRefs.current[String(closest.id)]) {
      noteRefs.current[String(closest.id)]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeDate, notes]);

  const saveNote = useCallback(async (id: number, content: string) => {
    setSaving((s) => ({ ...s, [id]: true }));
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, id, content }),
    });
    setSaving((s) => ({ ...s, [id]: false }));
    onNotesSaved();
  }, [symbol, onNotesSaved]);

  function handleChange(id: number, value: string) {
    setContents((c) => ({ ...c, [id]: value }));
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => saveNote(id, value), 1500);
  }

  async function deleteNote(id: number) {
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    onNotesSaved();
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
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date: today, content: "" }),
    });
    const newNote = await res.json();
    setAdding(false);
    onNotesSaved();
    // Scroll to top & expand new card
    setTimeout(() => {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (newNote?.id) setExpanded((e) => ({ ...e, [newNote.id]: true }));
    }, 150);
  }

  function isHighlighted(note: Note) {
    if (!activeDate) return false;
    return note.date.slice(0, 7) === activeDate.slice(0, 7);
  }

  const sorted = [...notes].sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt ?? "") || b.id - a.id);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <span className="text-sm text-gray-500">研究笔记 <span className="text-gray-300">({notes.length})</span></span>
        <button onClick={addNewNote} disabled={adding}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors">
          {adding ? "创建中..." : "+ 添加笔记"}
        </button>
      </div>

      {/* Notes list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {sorted.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-10">还没有笔记，点击「添加笔记」开始记录</p>
        )}

        {sorted.map((note) => {
          const isOpen = !!expanded[note.id];
          return (
            <div key={note.id}
              ref={(el) => { noteRefs.current[String(note.id)] = el; }}
              className={`rounded-xl border bg-white transition-all duration-300 overflow-hidden ${
                isHighlighted(note)
                  ? "border-blue-400 shadow-md shadow-blue-100 ring-1 ring-blue-300"
                  : "border-gray-200 shadow-sm"
              }`}
            >
              {/* Date + title row */}
              {(() => {
                const firstLine = (contents[note.id] ?? "").split("\n")[0].trim();
                return (
                  <div className={`px-3 py-2 border-b ${isHighlighted(note) ? "border-blue-100 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${isHighlighted(note) ? "text-blue-500" : "text-gray-400"}`}>
                        {note.date}
                      </span>
                      <div className="flex items-center gap-2">
                        {saving[note.id] && <span className="text-xs text-gray-400">保存中...</span>}
                        <button onClick={() => { if (confirm("确定删除这条笔记？")) deleteNote(note.id); }}
                          className="text-gray-400 hover:text-red-500 transition-colors text-xs border border-gray-200 hover:border-red-300 px-1.5 py-0.5 rounded">删除</button>
                      </div>
                    </div>
                    {firstLine && (
                      <div className={`mt-1 text-sm font-bold ${isHighlighted(note) ? "text-blue-700" : "text-gray-800"}`}>
                        {firstLine}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Textarea */}
              <textarea
                value={contents[note.id] ?? ""}
                onChange={(e) => handleChange(note.id, e.target.value)}
                rows={isOpen ? Math.max(COLLAPSED_ROWS, (contents[note.id] ?? "").split("\n").length + 2) : COLLAPSED_ROWS}
                placeholder="写下你的分析和思考..."
                className="w-full px-3 py-2.5 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none bg-white placeholder-gray-300 transition-all duration-200"
              />

              {/* Expand / collapse */}
              <div className="flex items-center justify-between px-3 pb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 cursor-pointer transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  上传图片
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(note.id, f); }} />
                </label>
                <button onClick={() => setExpanded((e) => ({ ...e, [note.id]: !e[note.id] }))}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  {isOpen ? "收起 ▲" : "展开 ▼"}
                </button>
              </div>

              {/* Images */}
              {note.images.length > 0 && (
                <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                  {note.images.map((img) => (
                    <img key={img.id} src={img.url} alt="" className="rounded-lg w-full object-cover max-h-36" />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
