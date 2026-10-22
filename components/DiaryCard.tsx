"use client";

import { useEffect, useState, useRef } from "react";

type Note = { id: number; content: string; date: string };

const HOUR_MS = 60 * 60 * 1000;

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The editor may rewrite "---\n附言" as HTML paragraphs, so match loosely.
const PS_SPLIT = /\s*-{3,}\s*(?=附言[（(])/;

function parseNote(note: Note) {
  const raw = note.content ?? "";
  const nl = raw.indexOf("\n");
  const title = stripHtml(nl > 0 ? raw.slice(0, nl) : "");
  const rest = stripHtml(nl > 0 ? raw.slice(nl + 1) : raw);

  const [main, ...postscripts] = rest.split(PS_SPLIT);
  return { title, body: main.trim(), postscripts: postscripts.map(p => p.trim()).filter(Boolean) };
}

// Rotation state lives in localStorage so it survives reloads and stock
// switches: every note is shown once (random order) before any repeats.
const SEEN_KEY = "diary-review-seen";

function readSeen(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(Number.isInteger) : [];
  } catch { return []; }
}

function pickNext(pool: Note[], lastId?: number): { note: Note; seen: number; total: number } | null {
  if (!pool.length) return null;
  const ids = new Set(pool.map(n => n.id));
  let seen = readSeen().filter(id => ids.has(id));
  let unseen = pool.filter(n => !seen.includes(n.id));
  if (!unseen.length) {
    seen = [];
    // new round: avoid showing the same note twice in a row
    unseen = pool.length > 1 ? pool.filter(n => n.id !== lastId) : pool;
  }
  const note = unseen[Math.floor(Math.random() * unseen.length)];
  seen.push(note.id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private mode */ }
  return { note, seen: seen.length, total: pool.length };
}

// Loaded once per page load; navigating between stocks reuses it.
let diaryCache: Promise<Note[]> | null = null;
function loadDiary(): Promise<Note[]> {
  if (!diaryCache) {
    diaryCache = fetch("/api/diary")
      .then(r => r.json())
      .then(d => (Array.isArray(d?.notes) ? d.notes : []))
      .catch(() => { diaryCache = null; return []; });
  }
  return diaryCache;
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DiaryCard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [visible, setVisible] = useState(false);
  const [addingPostscript, setAddingPostscript] = useState(false);
  const [psText, setPsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ seen: number; total: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The hourly timer is created once, so it reads the latest values through refs
  const notesRef = useRef<Note[]>([]);
  const currentIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    notesRef.current = notes;
    currentIdRef.current = current?.id;
  }, [notes, current]);
  const psRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function showNext(pool: Note[], lastId?: number) {
    const r = pickNext(pool, lastId);
    if (!r) return false;
    setCurrent(r.note);
    setProgress({ seen: r.seen, total: r.total });
    setVisible(true);
    setAddingPostscript(false);
    setPsText("");
    return true;
  }

  useEffect(() => {
    async function loadAndShow() {
      const data = await loadDiary();
      if (!data.length) return;
      setNotes(data);
      showNext(data);
    }

    loadAndShow();
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      showNext(notesRef.current, currentIdRef.current);
    }, HOUR_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Focus textarea when postscript input opens
  useEffect(() => {
    if (addingPostscript) setTimeout(() => psRef.current?.focus(), 50);
  }, [addingPostscript]);

  async function savePostscript() {
    if (!current || !psText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, text: psText, date: localDate() }),
      });
      if (res.ok) {
        const { psHtml } = await res.json();
        const newNote: Note = { ...current, content: current.content + psHtml };
        // keep the cached copy in sync so the postscript survives navigation
        diaryCache = loadDiary().then(list => list.map(n => n.id === newNote.id ? newNote : n));
        setCurrent(newNote);
        setNotes(prev => prev.map(n => n.id === newNote.id ? newNote : n));
        setAddingPostscript(false);
        setPsText("");
        // scroll to show the postscript
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
          }
        }, 80);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`保存失败: ${err.error ?? res.status}`);
      }
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !current) return null;

  const { title, body, postscripts } = parseNote(current);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ width: 360, maxHeight: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 text-sm">📖</span>
          <span className="text-xs font-semibold text-amber-700">投资日记回顾</span>
          <span className="text-xs text-amber-400">{current.date}</span>
          {progress && (
            <span className="text-xs text-amber-300" title="本轮已回顾 / 日记总数；全部看完才开始新一轮">
              · {progress.seen}/{progress.total}
            </span>
          )}
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-300 hover:text-gray-500 text-lg leading-none transition-colors"
          title="关闭"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="px-5 py-4 overflow-y-auto flex-1">
        {title && <p className="text-sm font-semibold text-gray-800 mb-2 leading-snug">{title}</p>}
        {body && <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{body}</p>}
        {!title && !body && <p className="text-sm text-gray-300 italic">（无内容）</p>}

        {/* Existing postscripts */}
        {postscripts.map((ps, i) => {
          const match = ps.match(/^附言[（(]\s*(.+?)\s*[）)]\s*([\s\S]*)$/);
          const psDate = match?.[1] ?? "";
          const psBody = match?.[2]?.trim() ?? ps;
          return (
            <div key={i} className="mt-6 pt-4 border-t border-dashed border-amber-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs text-amber-600 font-semibold">附言</span>
                {psDate && <span className="text-xs text-amber-400">{psDate}</span>}
              </div>
              <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">{psBody}</p>
            </div>
          );
        })}

        {/* Postscript input */}
        {addingPostscript && (
          <div className="mt-4 pt-3 border-t border-dashed border-amber-200">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-amber-500 font-medium">附言</span>
              <span className="text-xs text-gray-400">{new Date().toISOString().split("T")[0]}</span>
            </div>
            <textarea
              ref={psRef}
              value={psText}
              onChange={e => setPsText(e.target.value)}
              placeholder="写下此刻的感悟..."
              rows={3}
              className="w-full text-sm text-gray-700 bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-amber-400 leading-relaxed"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => { setAddingPostscript(false); setPsText(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={savePostscript}
                disabled={saving || !psText.trim()}
                className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white px-3 py-1 rounded transition-colors"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => { setAddingPostscript(v => !v); setPsText(""); }}
          className="text-xs text-amber-600 hover:text-amber-800 transition-colors"
        >
          {addingPostscript ? "收起" : "+ 写附言"}
        </button>
        <button
          onClick={() => {
            showNext(notes, current.id);
          }}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-full"
        >
          下一篇 →
        </button>
      </div>
    </div>
  );
}
