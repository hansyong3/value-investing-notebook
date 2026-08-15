"use client";

import { useEffect, useState, useRef } from "react";

type Note = { id: number; content: string; date: string };

const HOUR_MS = 60 * 60 * 1000;

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseNote(note: Note) {
  const raw = note.content ?? "";
  const nl = raw.indexOf("\n");
  const title = stripHtml(nl > 0 ? raw.slice(0, nl) : raw);
  const body = stripHtml(nl > 0 ? raw.slice(nl + 1) : "");
  return { title, body };
}

function pickRandom<T>(pool: T[], exclude?: T): T | null {
  if (!pool.length) return null;
  const filtered = exclude ? pool.filter(n => n !== exclude) : pool;
  const src = filtered.length ? filtered : pool;
  return src[Math.floor(Math.random() * src.length)];
}

export default function DiaryCard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function loadAndShow() {
      try {
        const stocksRes = await fetch("/api/stocks");
        const stocks: { symbol: string; name: string; notebook: boolean }[] = await stocksRes.json();

        // Match notebook with "日记" in the name; fall back to any notebook
        const diaryStock =
          stocks.find(s => s.notebook && s.name.includes("日记")) ??
          stocks.find(s => s.notebook);

        if (!diaryStock) return;

        const notesRes = await fetch(`/api/notes?symbol=${encodeURIComponent(diaryStock.symbol)}`);
        const data: Note[] = await notesRes.json();
        if (!Array.isArray(data) || !data.length) return;

        setNotes(data);

        // Always show on every page load
        const note = pickRandom(data);
        if (note) {
          setCurrent(note);
          setVisible(true);
        }
      } catch {
        // silently ignore
      }
    }

    loadAndShow();
  }, []);

  // Show a new random card every hour
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNotes(prev => {
        const note = pickRandom(prev);
        if (note) {
          setCurrent(note);
          setVisible(true);
        }
        return prev;
      });
    }, HOUR_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!visible || !current) return null;

  const { title, body } = parseNote(current);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ width: 360, maxHeight: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 text-sm">📖</span>
          <span className="text-xs font-semibold text-amber-700">投资日记回顾</span>
          <span className="text-xs text-amber-400">{current.date}</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-300 hover:text-gray-500 text-lg leading-none transition-colors"
          title="关闭"
        >
          ×
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="px-5 py-4 overflow-y-auto flex-1">
        {title && (
          <p className="text-sm font-semibold text-gray-800 mb-2 leading-snug">{title}</p>
        )}
        {body && (
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{body}</p>
        )}
        {!title && !body && (
          <p className="text-sm text-gray-300 italic">（无内容）</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
        <button
          onClick={() => {
            const next = pickRandom(notes, current);
            if (next) setCurrent(next);
          }}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-full"
        >
          下一篇 →
        </button>
      </div>
    </div>
  );
}
