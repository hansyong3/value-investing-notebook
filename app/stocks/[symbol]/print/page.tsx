"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type NoteImage = { id: number; url: string };
type Note = { id: number; date: string; content: string; starred: boolean; images: NoteImage[] };

function parseContent(content: string) {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: content, body: "" };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

export default function PrintPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = decodeURIComponent(symbol);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stockName, setStockName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      const [notesRes, stocksRes] = await Promise.all([
        fetch(`/api/notes?symbol=${decodedSymbol}`),
        fetch("/api/stocks"),
      ]);
      const notesData = await notesRes.json();
      const stocksData = await stocksRes.json();
      if (Array.isArray(notesData)) {
        const sorted = [...notesData].sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1;
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.id - a.id;
        });
        setNotes(sorted);
      }
      const stock = stocksData.find((s: { symbol: string; name: string }) => s.symbol === decodedSymbol);
      if (stock) setStockName(stock.name);
      setReady(true);
    }
    load();
  }, [decodedSymbol]);

  useEffect(() => {
    if (ready && notes.length > 0) {
      setTimeout(() => window.print(), 500);
    }
  }, [ready, notes]);

  if (!ready) return (
    <div className="flex items-center justify-center h-screen text-gray-400">加载中...</div>
  );

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 font-sans text-gray-900">
      {/* Cover */}
      <div className="mb-10 pb-6 border-b-2 border-gray-200">
        <div className="text-xs text-gray-400 mb-1 uppercase tracking-widest">价值投资笔记</div>
        <h1 className="text-3xl font-bold">{decodedSymbol}</h1>
        {stockName && <div className="text-lg text-gray-500 mt-1">{stockName}</div>}
        <div className="text-sm text-gray-400 mt-3">
          导出日期：{new Date().toLocaleDateString("zh-CN")} · 共 {notes.length} 条笔记
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-8">
        {notes.map((note) => {
          const { title, body } = parseContent(note.content);
          return (
            <div key={note.id} className="break-inside-avoid">
              <div className="flex items-center gap-2 mb-2">
                {note.starred && <span className="text-yellow-400 text-sm">★</span>}
                <span className="text-xs text-gray-400 font-mono">{note.date}</span>
              </div>
              {title && <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>}
              {body && (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>
              )}
              {note.images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {note.images.map((img) => (
                    <img key={img.id} src={img.url} alt="" className="rounded-lg w-full object-cover" />
                  ))}
                </div>
              )}
              <div className="mt-4 border-b border-gray-100" />
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page { margin: 2cm; }
          body { font-size: 12pt; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
