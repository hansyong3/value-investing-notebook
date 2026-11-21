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
// Notes written since the popup last looked ("known" set) jump the queue,
// newest first, so a fresh entry shows up at the next turn instead of
// waiting for its random slot in a 100+ note round.
const SEEN_KEY = "diary-review-seen";
const KNOWN_KEY = "diary-review-known";
const FIRST_RUN_NEW_DAYS = 14;

function readIds(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(Number.isInteger) : [];
  } catch { return null; }
}
function writeIds(key: string, ids: number[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* private mode */ }
}

function hasText(n: Note) {
  const { title, body } = parseNote(n);
  return !!(title || body);
}

type Pick = { note: Note; seen: number; total: number; isNew: boolean };

function pickNext(all: Note[], lastId?: number): Pick | null {
  // a just-created, still-empty note waits until it has text
  const pool = all.filter(hasText);
  if (!pool.length) return null;
  const ids = new Set(pool.map(n => n.id));

  let known = readIds(KNOWN_KEY);
  if (known == null) {
    // first run of this logic: entries from the last two weeks count as new
    const cutoff = new Date(Date.now() - FIRST_RUN_NEW_DAYS * 864e5).toISOString().slice(0, 10);
    known = pool.filter(n => n.date < cutoff).map(n => n.id);
  }
  const knownSet = new Set(known);

  let seen = (readIds(SEEN_KEY) ?? []).filter(id => ids.has(id));
  const fresh = pool
    .filter(n => !knownSet.has(n.id) && !seen.includes(n.id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  let note: Note;
  let isNew = false;
  if (fresh.length) {
    note = fresh[0];
    isNew = true;
  } else {
    let unseen = pool.filter(n => !seen.includes(n.id));
    if (!unseen.length) {
      seen = [];
      // new round: avoid showing the same note twice in a row
      unseen = pool.length > 1 ? pool.filter(n => n.id !== lastId) : pool;
    }
    note = unseen[Math.floor(Math.random() * unseen.length)];
  }

  seen.push(note.id);
  writeIds(SEEN_KEY, seen);
  // everything currently in the pool except still-unshown new notes is now known
  const pending = new Set(fresh.filter(n => n.id !== note.id).map(n => n.id));
  writeIds(KNOWN_KEY, pool.filter(n => !pending.has(n.id)).map(n => n.id));
  return { note, seen: seen.length, total: pool.length, isNew };
}

// Shared across stock switches, but re-fetched (text only, small) when older
// than 10 min so entries written while the tab stays open are picked up.
const DIARY_TTL_MS = 10 * 60 * 1000;
let diaryCache: { at: number; data: Promise<Note[]> } | null = null;
function loadDiary(): Promise<Note[]> {
  if (!diaryCache || Date.now() - diaryCache.at > DIARY_TTL_MS) {
    const prev = diaryCache?.data;
    const data: Promise<Note[]> = fetch("/api/diary", { cache: "no-store" })
      .then(r => r.json())
      .then(d => (Array.isArray(d?.notes) ? d.notes : []))
      .catch(() => { diaryCache = null; return prev ?? []; });
    diaryCache = { at: Date.now(), data };
  }
  return diaryCache.data;
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DiaryCard() {
  const [current, setCurrent] = useState<Note | null>(null);
  const [visible, setVisible] = useState(false);
  const [addingPostscript, setAddingPostscript] = useState(false);
  const [psText, setPsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ seen: number; total: number } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The hourly timer is created once, so it reads the latest values through a ref
  const currentIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    currentIdRef.current = current?.id;
  }, [current]);
  const psRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Always picks from a fresh-enough list, so newly written entries are included
  async function showNext(lastId?: number) {
    const pool = await loadDiary();
    const r = pickNext(pool, lastId);
    if (!r) return;
    setCurrent(r.note);
    setProgress({ seen: r.seen, total: r.total });
    setIsNew(r.isNew);
    setVisible(true);
    setAddingPostscript(false);
    setPsText("");
  }

  useEffect(() => {
    // deferred: also keeps React strict mode's double-mount from consuming two picks
    const t = setTimeout(() => showNext(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      showNext(currentIdRef.current);
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
        diaryCache = { at: Date.now(), data: loadDiary().then(list => list.map(n => n.id === newNote.id ? newNote : n)) };
        setCurrent(newNote);
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
          {isNew && (
            <span className="text-[10px] font-semibold text-white bg-amber-500 rounded px-1 leading-4" title="新写的日记，优先回顾">新</span>
          )}
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
          onClick={() => { showNext(current.id); }}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-full"
        >
          下一篇 →
        </button>
      </div>
    </div>
  );
}
