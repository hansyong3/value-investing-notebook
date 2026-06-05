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
    if (ready) setTimeout(() => window.print(), 600);
  }, [ready]);

  if (!ready) return (
    <div className="flex items-center justify-center h-screen text-gray-400 text-sm">加载中...</div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif; }
        @page {
          size: A4 portrait;
          margin: 20mm 18mm;
        }
        @media print {
          body { font-size: 11pt; color: #111; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          .note-card { break-inside: avoid; }
        }
        .note-body img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
        .note-body p { margin: 4px 0; line-height: 1.6; }
        .note-body strong { font-weight: 700; }
        .note-body em { font-style: italic; }
        .note-body [style*="color: rgb(220"] { color: #dc2626; }
      `}</style>

      <div style={{ maxWidth: "170mm", margin: "0 auto", padding: "0" }}>
        {/* Cover */}
        <div style={{ marginBottom: "12mm", paddingBottom: "6mm", borderBottom: "2px solid #e5e7eb" }}>
          <div style={{ fontSize: "9pt", color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
            价值投资笔记
          </div>
          <h1 style={{ fontSize: "22pt", fontWeight: "800", margin: "0 0 4px 0" }}>{decodedSymbol}</h1>
          {stockName && <div style={{ fontSize: "14pt", color: "#6b7280" }}>{stockName}</div>}
          <div style={{ fontSize: "9pt", color: "#9ca3af", marginTop: "8px" }}>
            导出日期：{new Date().toLocaleDateString("zh-CN")} · 共 {notes.length} 条笔记
          </div>
        </div>

        {/* Notes */}
        {notes.map((note, i) => {
          const { title, body } = parseContent(note.content);
          return (
            <div key={note.id} className="note-card" style={{ marginBottom: "10mm", paddingBottom: "8mm", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                {note.starred && <span style={{ color: "#fbbf24", fontSize: "10pt" }}>★</span>}
                <span style={{ fontSize: "9pt", color: "#9ca3af", fontFamily: "monospace" }}>{note.date}</span>
              </div>
              {title && (
                <h2 style={{ fontSize: "13pt", fontWeight: "700", margin: "0 0 6px 0", color: "#111" }}>{title}</h2>
              )}
              {body && (
                <div
                  className="note-body"
                  style={{ fontSize: "10.5pt", color: "#374151", lineHeight: "1.7" }}
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              )}
              {note.images.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                  {note.images.map((img) => (
                    <img key={img.id} src={img.url} alt="" style={{ width: "100%", borderRadius: "6px" }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
