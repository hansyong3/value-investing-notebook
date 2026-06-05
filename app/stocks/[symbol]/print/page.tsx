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

// Clean up Tiptap HTML for print: remove empty paragraphs
function cleanHtml(html: string) {
  return html
    .replace(/<p><\/p>/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
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
        setNotes([...notesData].sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1;
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.id - a.id;
        }));
      }
      const stock = Array.isArray(stocksData) && stocksData.find((s: {symbol:string;name:string}) => s.symbol === decodedSymbol);
      if (stock) setStockName(stock.name);
      setReady(true);
    }
    load();
  }, [decodedSymbol]);

  useEffect(() => {
    if (ready) setTimeout(() => window.print(), 800);
  }, [ready]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @charset "UTF-8";
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif;
          font-size: 11pt;
          color: #111;
          background: white;
        }
        @page {
          size: A4 portrait;
          margin: 22mm 20mm;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .cover { margin-bottom: 14mm; padding-bottom: 8mm; border-bottom: 2pt solid #111; }
        .cover-label { font-size: 8pt; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
        .cover-symbol { font-size: 24pt; font-weight: 900; line-height: 1.1; }
        .cover-name { font-size: 13pt; color: #555; margin-top: 4px; }
        .cover-meta { font-size: 8pt; color: #aaa; margin-top: 10px; }
        .note { margin-bottom: 10mm; padding-bottom: 8mm; border-bottom: 0.5pt solid #e5e7eb; page-break-inside: avoid; }
        .note-date { font-size: 8pt; color: #aaa; font-family: monospace; margin-bottom: 5px; }
        .note-title { font-size: 13pt; font-weight: 700; color: #111; margin-bottom: 6px; line-height: 1.4; }
        .note-body { font-size: 10.5pt; color: #333; line-height: 1.75; }
        .note-body p { margin-bottom: 6px; }
        .note-body strong { font-weight: 700; }
        .note-body em { font-style: italic; }
        .note-body img { max-width: 100%; border-radius: 4px; margin: 8px 0; }
        .star { color: #f59e0b; margin-right: 4px; }
      ` }} />

      {!ready ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#aaa" }}>
          加载中...
        </div>
      ) : (
        <div style={{ maxWidth: "170mm", margin: "0 auto" }}>
          <div className="cover">
            <div className="cover-label">价值投资笔记</div>
            <div className="cover-symbol">{decodedSymbol}</div>
            {stockName && <div className="cover-name">{stockName}</div>}
            <div className="cover-meta">
              导出日期：{new Date().toLocaleDateString("zh-CN")} · 共 {notes.length} 条笔记
            </div>
          </div>

          {notes.map((note) => {
            const { title, body } = parseContent(note.content);
            const cleanBody = cleanHtml(body);
            return (
              <div key={note.id} className="note">
                <div className="note-date">
                  {note.starred && <span className="star">★</span>}
                  {note.date}
                </div>
                {title && <div className="note-title">{title}</div>}
                {cleanBody && (
                  <div
                    className="note-body"
                    dangerouslySetInnerHTML={{ __html: cleanBody }}
                  />
                )}
                {note.images.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
                    {note.images.map((img) => (
                      <img key={img.id} src={img.url} alt="" style={{ width: "100%", borderRadius: "4px" }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
