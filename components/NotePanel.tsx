"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type NoteImage = { id: number; url: string };
type Note = { id: number; date: string; content: string; starred: boolean; images: NoteImage[]; createdAt?: string };

type Props = {
  symbol: string;
  notes: Note[];
  activeDate: string | null;
  onNotesSaved: () => void;
  onExportPdf: () => void;
};

// content stored as "title\nbody"
function parseContent(content: string) {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: content, body: "" };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

const COLLAPSED_ROWS = 3;

export default function NotePanel({ symbol, notes, activeDate, onNotesSaved, onExportPdf }: Props) {
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [bodies, setBodies] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const editingIds = useRef<Set<number>>(new Set());

  // Sync from server for notes not being edited
  useEffect(() => {
    setTitles((prev) => {
      const next = { ...prev };
      for (const n of notes) {
        if (!editingIds.current.has(n.id)) {
          next[n.id] = parseContent(n.content).title;
        }
      }
      return next;
    });
    setBodies((prev) => {
      const next = { ...prev };
      for (const n of notes) {
        if (!editingIds.current.has(n.id)) {
          next[n.id] = parseContent(n.content).body;
        }
      }
      return next;
    });
  }, [notes]);

  // Scroll to active date
  useEffect(() => {
    if (!activeDate) return;
    const ym = activeDate.slice(0, 7);
    const closest = [...notes].reverse().find(
      (n) => n.date <= activeDate && n.date.slice(0, 7) >= ym
    ) ?? notes[notes.length - 1];
    if (closest) noteRefs.current[String(closest.id)]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeDate, notes]);

  const schedSave = useCallback((id: number, title: string, body: string) => {
    editingIds.current.add(id);
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      setSaving((s) => ({ ...s, [id]: true }));
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, id, content: title + (body ? "\n" + body : "") }),
      });
      setSaving((s) => ({ ...s, [id]: false }));
      editingIds.current.delete(id);
      onNotesSaved();
    }, 1500);
  }, [symbol, onNotesSaved]);

  function handleTitle(id: number, val: string) {
    setTitles((t) => ({ ...t, [id]: val }));
    schedSave(id, val, bodies[id] ?? "");
  }

  function handleBody(id: number, val: string) {
    setBodies((b) => ({ ...b, [id]: val }));
    schedSave(id, titles[id] ?? "", val);
  }

  async function toggleStar(id: number, current: boolean) {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, id, starred: !current }),
    });
    onNotesSaved();
  }

  async function deleteNote(id: number) {
    if (!confirm("确定删除这条笔记？")) return;
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    onNotesSaved();
  }

  async function handlePaste(id: number, e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    // Convert to base64 and insert inline
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const insertion = `\n![](${base64})\n`;
      const newBody = (bodies[id] ?? "") + insertion;
      setBodies((b) => ({ ...b, [id]: newBody }));
      schedSave(id, titles[id] ?? "", newBody);
    };
    reader.readAsDataURL(file);
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
    setTimeout(() => {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (newNote?.id) setExpanded((e) => ({ ...e, [newNote.id]: true }));
    }, 150);
  }

  function isHighlighted(note: Note) {
    if (!activeDate) return false;
    return note.date.slice(0, 7) === activeDate.slice(0, 7);
  }

  // Starred first, then by date desc, then by id desc
  const sorted = [...notes].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <span className="text-sm text-gray-500">研究笔记 <span className="text-gray-300">({notes.length})</span></span>
        <div className="flex items-center gap-2">
          <button onClick={onExportPdf}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1.5 rounded transition-colors">
            导出 PDF
          </button>
          <button onClick={addNewNote} disabled={adding}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors">
            {adding ? "创建中..." : "+ 添加笔记"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {sorted.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-10">还没有笔记，点击「添加笔记」开始记录</p>
        )}

        {sorted.map((note) => {
          const isOpen = !!expanded[note.id];
          const hl = isHighlighted(note);
          return (
            <div key={note.id}
              ref={(el) => { noteRefs.current[String(note.id)] = el; }}
              className={`rounded-xl border bg-white transition-all duration-300 overflow-hidden ${
                hl ? "border-blue-400 shadow-md shadow-blue-100 ring-1 ring-blue-300" : "border-gray-200 shadow-sm"
              }`}
            >
              {/* Top bar: date + saving + delete */}
              <div className={`flex items-center justify-between px-3 py-1.5 border-b ${
                hl ? "border-blue-100 bg-blue-50" : "border-gray-100 bg-gray-50"
              }`}>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleStar(note.id, note.starred)}
                    className={`text-base leading-none transition-colors ${note.starred ? "text-yellow-400 hover:text-yellow-300" : "text-gray-400 hover:text-yellow-400"}`}
                    title={note.starred ? "取消星标" : "星标置顶"}>
                    ★
                  </button>
                  <input
                    type="date"
                    defaultValue={note.date}
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ symbol, id: note.id, date: e.target.value }),
                      });
                      onNotesSaved();
                    }}
                    className={`text-xs border-none bg-transparent focus:outline-none cursor-pointer ${hl ? "text-blue-500" : "text-gray-400"}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {saving[note.id] && <span className="text-xs text-gray-400">保存中...</span>}
                  <button onClick={() => deleteNote(note.id)}
                    className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-1.5 py-0.5 rounded transition-colors">
                    删除
                  </button>
                </div>
              </div>

              {/* Title input */}
              <input
                type="text"
                value={titles[note.id] ?? ""}
                onChange={(e) => handleTitle(note.id, e.target.value)}
                placeholder="标题"
                className="w-full px-3 pt-2.5 pb-1 text-base font-bold text-gray-800 placeholder-gray-300 focus:outline-none bg-white border-b border-gray-100"
              />

              {/* Body textarea */}
              <textarea
                value={bodies[note.id] ?? ""}
                onChange={(e) => handleBody(note.id, e.target.value)}
                onPaste={(e) => handlePaste(note.id, e)}
                rows={isOpen
                  ? Math.max(COLLAPSED_ROWS, (bodies[note.id] ?? "").replace(/!\[.*?\]\(.*?\)\n?/g, "").split("\n").length + 2)
                  : COLLAPSED_ROWS}
                placeholder="写下你的分析和思考...（可直接粘贴图片）"
                className="w-full px-3 py-2 text-base text-gray-700 leading-relaxed resize-none focus:outline-none bg-white placeholder-gray-300 transition-all duration-200"
              />

              {/* Inline images parsed from body */}
              {(() => {
                const imgUrls = [...(bodies[note.id] ?? "").matchAll(/!\[.*?\]\((https?:\/\/[^)]+)\)/g)].map(m => m[1]);
                return imgUrls.length > 0 ? (
                  <div className="px-3 pb-2 grid grid-cols-2 gap-2">
                    {imgUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="rounded-lg w-full object-cover max-h-40" />
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Footer: expand only */}
              <div className="flex items-center justify-end px-3 pb-2.5">
                <button onClick={() => setExpanded((e) => ({ ...e, [note.id]: !e[note.id] }))}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  {isOpen ? "收起 ▲" : "展开 ▼"}
                </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
