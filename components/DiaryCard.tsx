"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type Note = { id: number; content: string; date: string };

const STORAGE_KEY = "diary_card_last_shown";
const HOUR_MS = 60 * 60 * 1000;

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function parseNote(note: Note) {
  const raw = note.content ?? "";
  const nl = raw.indexOf("\n");
  const titleRaw = nl > 0 ? raw.slice(0, nl).trim() : raw.trim();
  const bodyRaw = nl > 0 ? raw.slice(nl + 1) : "";
  const title = stripHtml(titleRaw);
  const body = stripHtml(bodyRaw);
  return { title, body };
}

export default function DiaryCard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pickRandom = useCallback((pool: Note[]) => {
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  const show = useCallback((pool: Note[]) => {
    const note = pickRandom(pool);
    if (!note) return;
    setCurrent(note);
    setVisible(true);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }, [pickRandom]);

  // Load diary notes
  useEffect(() => {
    async function load() {
      try {
        // Find notebook named 投资日记 (or containing 日记)
        const stocksRes = await fetch("/api/stocks");
        const stocks: { id: number; symbol: string; name: string; notebook: boolean }[] = await stocksRes.json();
        const diaryStock = stocks.find(s => s.notebook && s.name.includes("日记"));
        if (!diaryStock) { setLoaded(true); return; }

        const notesRes = await fetch(`/api/notes?symbol=${encodeURIComponent(diaryStock.symbol)}`);
        const data: Note[] = await notesRes.json();
        if (!Array.isArray(data) || !data.length) { setLoaded(true); return; }
        setNotes(data);
        setLoaded(true);
        return data;
      } catch {
        setLoaded(true);
        return [];
      }
    }

    load().then((data) => {
      if (!data || !data.length) return;
      // Show on load if it's been more than 1 hour since last shown
      const last = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
      if (Date.now() - last >= HOUR_MS) {
        show(data);
      }
    });
  }, [show]);

  // Hourly auto-show
  useEffect(() => {
    if (!loaded) return;
    timerRef.current = setInterval(() => {
      setNotes(prev => {
        if (prev.length) show(prev);
        return prev;
      });
    }, HOUR_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loaded, show]);

  if (!visible || !current) return null;

  const { title, body } = parseNote(current);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-100">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 text-sm">📖</span>
          <span className="text-xs font-semibold text-amber-700">投资日记回顾</span>
          <span className="text-xs text-amber-400">{current.date}</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-300 hover:text-gray-500 text-base leading-none transition-colors"
          title="关闭"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {title && (
          <p className="text-sm font-semibold text-gray-800 mb-1.5 leading-snug line-clamp-2">{title}</p>
        )}
        {body && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">{body}</p>
        )}
        {!title && !body && (
          <p className="text-xs text-gray-300 italic">（无内容）</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 flex justify-end">
        <button
          onClick={() => {
            const next = pickRandom(notes.filter(n => n.id !== current.id) || notes);
            if (next) {
              setCurrent(next);
              localStorage.setItem(STORAGE_KEY, Date.now().toString());
            }
          }}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors border border-amber-200 hover:border-amber-400 px-3 py-1 rounded-full"
        >
          下一篇 →
        </button>
      </div>
    </div>
  );
}
