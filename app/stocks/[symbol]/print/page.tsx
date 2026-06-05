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

const s = {
  page: { fontFamily: '"PingFang SC","Microsoft YaHei",Arial,sans-serif', fontSize: 14, color: "#111", background: "#fff", minHeight: "100vh", padding: "40px 60px", maxWidth: 800, margin: "0 auto" } as React.CSSProperties,
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" } as React.CSSProperties,
  printBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" } as React.CSSProperties,
  cover: { marginBottom: 40, paddingBottom: 24, borderBottom: "2px solid #111" } as React.CSSProperties,
  label: { fontSize: 11, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 6 },
  symbol: { fontSize: 32, fontWeight: 900, lineHeight: 1.1, margin: "0 0 4px 0" } as React.CSSProperties,
  name: { fontSize: 16, color: "#6b7280", margin: "4px 0" } as React.CSSProperties,
  meta: { fontSize: 11, color: "#aaa", marginTop: 10 } as React.CSSProperties,
  note: { marginBottom: 36, paddingBottom: 28, borderBottom: "1px solid #f3f4f6" } as React.CSSProperties,
  date: { fontSize: 11, color: "#aaa", fontFamily: "monospace", marginBottom: 6 } as React.CSSProperties,
  title: { fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 8, lineHeight: 1.4 } as React.CSSProperties,
  body: { fontSize: 14, color: "#333", lineHeight: 1.8 } as React.CSSProperties,
};

export default function PrintPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = decodeURIComponent(symbol);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stockName, setStockName] = useState("");
  const [loading, setLoading] = useState(true);

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
      const stock = Array.isArray(stocksData) && stocksData.find((s: {symbol:string}) => s.symbol === decodedSymbol);
      if (stock) setStockName((stock as {name:string}).name);
      setLoading(false);
    }
    load();
  }, [decodedSymbol]);

  if (loading) return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#aaa", fontFamily:"Arial,sans-serif" }}>加载中...</div>;

  return (
    <div style={s.page}>
      {/* Toolbar - hidden when printing */}
      <div style={s.toolbar} className="no-print">
        <span style={{ fontSize: 13, color: "#6b7280" }}>预览模式 — 确认内容后点击打印</span>
        <button style={s.printBtn} onClick={() => window.print()}>🖨️ 打印 / 保存 PDF</button>
      </div>

      {/* Cover */}
      <div style={s.cover}>
        <div style={s.label}>价值投资笔记</div>
        <div style={s.symbol}>{decodedSymbol}</div>
        {stockName && <div style={s.name}>{stockName}</div>}
        <div style={s.meta}>导出日期：{new Date().toLocaleDateString("zh-CN")} · 共 {notes.length} 条笔记</div>
      </div>

      {/* Notes */}
      {notes.map((note) => {
        const { title, body } = parseContent(note.content);
        return (
          <div key={note.id} style={s.note}>
            <div style={s.date}>
              {note.starred && <span style={{ color: "#f59e0b", marginRight: 4 }}>★</span>}
              {note.date}
            </div>
            {title && <div style={s.title}>{title}</div>}
            {body && (
              <div
                style={s.body}
                dangerouslySetInnerHTML={{ __html: body.replace(/<p><\/p>/g, "").replace(/<p>\s*<\/p>/g, "") }}
              />
            )}
            {note.images.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:12 }}>
                {note.images.map((img) => (
                  <img key={img.id} src={img.url} alt="" style={{ width:"100%", borderRadius:4 }} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 20mm 18mm; }
          body { font-size: 11pt; }
        }
      `}</style>
    </div>
  );
}
