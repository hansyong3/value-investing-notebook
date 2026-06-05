"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import NotePanel from "@/components/NotePanel";
import HoldingsPanel from "@/components/HoldingsPanel";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string; starred: boolean; images: { id: number; url: string }[] };
type Stock = { id: number; symbol: string; name: string; notebook: boolean };
type Holding = { id: number; type: string; date: string; shares: string; price: string; currency: string; fee: string; note: string };

async function exportNotes(symbol: string, stockName: string) {
  // Fetch fresh data directly from API
  const res = await fetch(`/api/notes?symbol=${symbol}`);
  const notes: Note[] = await res.json();
  // Debug: show first note content
  if (notes.length > 0) {
    const first = notes[0];
    alert(`共${notes.length}条笔记\n第一条内容前50字：\n${first.content.slice(0, 50)}`);
  } else {
    alert("没有抓到笔记，notes为空");
    return;
  }

  const sorted = [...notes].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });

  const notesHtml = sorted.map(note => {
    const nl = note.content.indexOf("\n");
    const title = nl > 0 ? note.content.slice(0, nl).trim() : "";
    const body = nl >= 0 ? note.content.slice(nl + 1) : note.content;
    const cleanBody = body.replace(/<p>\s*<\/p>/g, "").trim();
    return `
      <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #f0f0f0;page-break-inside:avoid">
        <div style="font-size:11px;color:#aaa;margin-bottom:6px;font-family:monospace">
          ${note.starred ? '<span style="color:#f59e0b">★</span> ' : ''}${note.date}
        </div>
        ${title ? `<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:8px;line-height:1.4">${title}</div>` : ""}
        ${cleanBody ? `<div style="font-size:14px;color:#333;line-height:1.75">${cleanBody}</div>` : ""}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${symbol} - 投资笔记</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif;background:#fff;color:#111;padding:40px 60px;max-width:800px;margin:0 auto}
    @page{size:A4 portrait;margin:20mm 18mm}
    @media print{.toolbar{display:none!important}body{padding:0}}
    p{margin-bottom:6px;line-height:1.75}
    strong{font-weight:700}em{font-style:italic}
    img{max-width:100%;border-radius:4px;margin:8px 0}
  </style>
</head>
<body>
  <div class="toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #e5e7eb">
    <span style="font-size:13px;color:#888">共 ${sorted.length} 条笔记 — 确认内容后打印</span>
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:14px;cursor:pointer">🖨️ 打印 / 保存 PDF</button>
  </div>
  <div style="margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #111">
    <div style="font-size:10px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">价值投资笔记</div>
    <div style="font-size:32px;font-weight:900;line-height:1.1">${symbol}</div>
    ${stockName ? `<div style="font-size:16px;color:#666;margin-top:4px">${stockName}</div>` : ""}
    <div style="font-size:10px;color:#aaa;margin-top:10px">导出日期：${new Date().toLocaleDateString("zh-CN")} · 共 ${sorted.length} 条</div>
  </div>
  ${notesHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) alert("请允许弹出窗口后重试");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const INTERVALS = [{ label: "日K", value: "1d" }, { label: "周K", value: "1wk" }, { label: "月K", value: "1mo" }];
const RANGES = [{ label: "3月", value: "3mo" }, { label: "6月", value: "6mo" }, { label: "1年", value: "1y" }, { label: "2年", value: "2y" }, { label: "5年", value: "5y" }, { label: "10年", value: "10y" }];

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const router = useRouter();
  const decodedSymbol = decodeURIComponent(symbol);

  // Resizable notes panel
  const [notesWidth, setNotesWidth] = useState(48); // percent
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [bars, setBars] = useState<Bar[]>([]);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [holdingsList, setHoldingsList] = useState<Holding[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [interval, setInterval] = useState("1d");
  const [range, setRange] = useState("2y");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);

  // Add stock inline
  const [addingStock, setAddingStock] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");

  // Rename stock
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  // Drag-and-drop state
  const [dragId, setDragId] = useState<number | null>(null);

  const fetchStocks = useCallback(async () => {
    const res = await fetch("/api/stocks");
    const data = await res.json();
    if (Array.isArray(data)) setStocks(data);
  }, []);

  const fetchPrice = useCallback(async () => {
    setChartLoading(true);
    setChartError(false);
    try {
      const res = await fetch(`/api/price?symbol=${decodedSymbol}&interval=${interval}&range=${range}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBars(data);
        if (data.length > 0) setLatestPrice(data[data.length - 1].close);
      }
      else setChartError(true);
    } catch { setChartError(true); }
    finally { setChartLoading(false); }
  }, [decodedSymbol, interval, range]);

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/notes?symbol=${decodedSymbol}`);
    const data = await res.json();
    if (Array.isArray(data)) setNotes(data);
  }, [decodedSymbol]);

  const fetchHoldings = useCallback(async () => {
    const res = await fetch(`/api/holdings?symbol=${decodedSymbol}`);
    const data = await res.json();
    if (Array.isArray(data)) setHoldingsList(data);
  }, [decodedSymbol]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);
  useEffect(() => { fetchPrice(); fetchNotes(); fetchHoldings(); }, [fetchPrice, fetchNotes, fetchHoldings]);

  async function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const reordered = [...stocks];
    const fromIdx = reordered.findIndex(s => s.id === dragId);
    const toIdx = reordered.findIndex(s => s.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setStocks(reordered);
    setDragId(null);
    await fetch("/api/stocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: reordered.map((s, i) => ({ id: s.id, order: i })) }),
    });
  }

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    if (!newSymbol || !newName) return;
    await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: newSymbol, name: newName }),
    });
    setNewSymbol(""); setNewName(""); setAddingStock(false);
    await fetchStocks();
    router.push(`/stocks/${newSymbol.toUpperCase()}`);
  }

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden">

      {/* Left sidebar */}
      <aside className="w-40 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-3 py-2.5 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">观察清单</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 标的 */}
          {stocks.filter(s => !s.notebook).map((stock) => (
            <div key={stock.id}
              draggable
              onDragStart={() => setDragId(stock.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stock.id)}
              className={`group flex items-center border-b border-gray-100 transition-colors cursor-grab active:cursor-grabbing ${
                stock.symbol === decodedSymbol ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-100"
              } ${dragId === stock.id ? "opacity-40" : ""}`}>
              {/* Drag handle */}
              <span className="pl-2 text-gray-300 group-hover:text-gray-400 text-xs select-none">⠿</span>
              <button onClick={() => router.push(`/stocks/${stock.symbol}`)}
                className="flex-1 text-left px-2 py-2.5 min-w-0">
                {editingId === stock.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={async () => {
                      if (editingName.trim() && editingName !== stock.name) {
                        await fetch("/api/stocks", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: stock.id, name: editingName.trim() }),
                        });
                        fetchStocks();
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-sm font-semibold text-gray-800 bg-white border border-blue-400 rounded px-1 focus:outline-none"
                  />
                ) : (
                  <div
                    className={`text-sm font-semibold truncate ${stock.symbol === decodedSymbol ? "text-blue-600" : "text-gray-800"}`}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(stock.id); setEditingName(stock.name); }}
                    title="双击编辑名称"
                  >
                    {stock.name}
                  </div>
                )}
                <div className="text-xs font-mono text-gray-400 truncate">{stock.symbol}</div>
              </button>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 mr-1.5 transition-all">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await fetch("/api/stocks", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: stock.id, notebook: !stock.notebook }),
                    });
                    await fetchStocks();
                  }}
                  className="text-gray-300 hover:text-purple-500 transition-colors text-xs"
                  title={stock.notebook ? "转为标的" : "转为笔记本"}
                >
                  {stock.notebook ? "📈" : "📓"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`确定删除 ${stock.symbol}？相关笔记和持仓也会一并删除。`)) return;
                    await fetch(`/api/stocks?id=${stock.id}`, { method: "DELETE" });
                    await fetchStocks();
                    if (stock.symbol === decodedSymbol && stocks.length > 1) {
                      const next = stocks.find(s => s.id !== stock.id);
                      if (next) router.push(`/stocks/${next.symbol}`);
                      else router.push("/");
                    } else if (stocks.length <= 1) {
                      router.push("/");
                    }
                  }}
                  className="text-gray-300 hover:text-red-400 transition-colors text-xs px-0.5"
                >✕</button>
              </div>
            </div>
          ))}

          {/* 笔记本分区 */}
          {stocks.some(s => s.notebook) && (
            <>
              <div className="px-3 pt-3 pb-1.5 border-t border-gray-200 mt-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">笔记本</span>
              </div>
              {stocks.filter(s => s.notebook).map((stock) => (
                <div key={stock.id}
                  draggable
                  onDragStart={() => setDragId(stock.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stock.id)}
                  className={`group flex items-center border-b border-gray-100 transition-colors cursor-grab active:cursor-grabbing ${
                    stock.symbol === decodedSymbol ? "bg-purple-50 border-l-2 border-l-purple-400" : "hover:bg-gray-100"
                  } ${dragId === stock.id ? "opacity-40" : ""}`}>
                  <span className="pl-2 text-gray-300 group-hover:text-gray-400 text-xs select-none">⠿</span>
                  <button onClick={() => router.push(`/stocks/${stock.symbol}`)}
                    className="flex-1 text-left px-2 py-2.5 min-w-0">
                    {editingId === stock.id ? (
                      <input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)}
                        onBlur={async () => {
                          if (editingName.trim() && editingName !== stock.name) {
                            await fetch("/api/stocks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: stock.id, name: editingName.trim() }) });
                            fetchStocks();
                          }
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-sm font-semibold text-gray-800 bg-white border border-purple-400 rounded px-1 focus:outline-none"
                      />
                    ) : (
                      <div className={`text-sm font-semibold truncate ${stock.symbol === decodedSymbol ? "text-purple-600" : "text-gray-800"}`}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingId(stock.id); setEditingName(stock.name); }}>
                        {stock.name}
                      </div>
                    )}
                    <div className="text-xs text-purple-300">📓</div>
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 mr-1.5 transition-all">
                    <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/stocks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: stock.id, notebook: false }) }); fetchStocks(); }}
                      className="text-gray-300 hover:text-blue-500 transition-colors text-xs" title="转为标的">📈</button>
                    <button onClick={async () => { if (!confirm(`确定删除 ${stock.name}？`)) return; await fetch(`/api/stocks?id=${stock.id}`, { method: "DELETE" }); fetchStocks(); if (stock.symbol === decodedSymbol) router.push("/"); }}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xs px-0.5">✕</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Add stock / notebook */}
        <div className="border-t border-gray-200 p-2 space-y-1">
          {addingStock ? (
            <form onSubmit={addStock} className="space-y-1.5">
              <input autoFocus value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="代码 (AAPL)" className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="名称" className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
              <div className="flex gap-1">
                <button type="submit" className="flex-1 bg-blue-600 text-white text-xs py-1 rounded hover:bg-blue-500 transition-colors">添加</button>
                <button type="button" onClick={() => setAddingStock(false)} className="flex-1 bg-gray-200 text-gray-600 text-xs py-1 rounded hover:bg-gray-300 transition-colors">取消</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAddingStock(true)}
              className="w-full text-xs text-gray-400 hover:text-blue-600 py-1.5 flex items-center justify-center gap-1 transition-colors">
              <span>+</span> 添加标的
            </button>
          )}
          <button
            onClick={async () => {
              const name = prompt("笔记本名称：");
              if (!name) return;
              const symbol = "NB_" + Date.now();
              await fetch("/api/stocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, name, notebook: true }),
              });
              await fetchStocks();
              router.push(`/stocks/${symbol}`);
            }}
            className="w-full text-xs text-gray-400 hover:text-purple-600 py-1.5 flex items-center justify-center gap-1 transition-colors">
            <span>+</span> 添加笔记本
          </button>
          <Link href="/backup"
            className="w-full text-xs text-gray-300 hover:text-gray-500 py-1.5 flex items-center justify-center gap-1 transition-colors border-t border-gray-100 mt-1 pt-2">
            🔒 备份 / 恢复数据
          </Link>
        </div>
      </aside>

      {stocks.find(s => s.symbol === decodedSymbol)?.notebook ? (
        /* NOTES: full-width notes only, no chart */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
          <NotePanel symbol={decodedSymbol} notes={notes} activeDate={null} onNotesSaved={fetchNotes} onExportPdf={() => exportNotes(decodedSymbol, stocks.find(s => s.symbol === decodedSymbol)?.name ?? "")} centered />
        </div>
      ) : (
        <div ref={containerRef} className="flex flex-1 overflow-hidden min-h-0">
          {/* Center: chart + holdings */}
          <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-200 flex-shrink-0 bg-white">
              <span className="font-mono font-bold text-blue-600">{decodedSymbol}</span>
              <span className="text-gray-400 text-sm">{stocks.find(s => s.symbol === decodedSymbol)?.name}</span>
              <div className="ml-auto flex items-center gap-0.5">
                {INTERVALS.map(i => (
                  <button key={i.value} onClick={() => setInterval(i.value)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${interval === i.value ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
                    {i.label}
                  </button>
                ))}
                <div className="w-px h-3 bg-gray-300 mx-1" />
                {RANGES.map(r => (
                  <button key={r.value} onClick={() => setRange(r.value)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${range === r.value ? "bg-gray-200 text-gray-800 font-medium" : "text-gray-500 hover:text-gray-800"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div className="relative flex-[11] min-h-0">
              {chartLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                  <span className="text-gray-400 text-sm">加载行情...</span>
                </div>
              )}
              {chartError && !chartLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                  <p className="text-gray-400 text-sm">行情数据加载失败</p>
                  <button onClick={fetchPrice} className="text-xs text-blue-500 border border-blue-300 px-3 py-1 rounded hover:bg-blue-50 transition-colors">重试</button>
                </div>
              )}
              <StockChart data={bars} notes={notes} holdings={holdingsList} onCrosshairMove={setActiveDate} />
            </div>

            {/* Holdings */}
            <div className="flex-[9] min-h-0 overflow-hidden">
              <HoldingsPanel symbol={decodedSymbol} holdings={holdingsList} onSaved={fetchHoldings} currentPrice={latestPrice} />
            </div>
          </div>

          {/* Drag handle */}
          <div
            className="w-px flex-shrink-0 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors group"
            onMouseDown={(e) => {
              e.preventDefault();
              isDragging.current = true;
              const onMove = (ev: MouseEvent) => {
                if (!isDragging.current || !containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const pct = Math.min(75, Math.max(20, ((rect.right - ev.clientX) / rect.width) * 100));
                setNotesWidth(pct);
              };
              const onUp = () => {
                isDragging.current = false;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />

          {/* Right: notes */}
          <div className="flex-shrink-0 min-h-0 overflow-hidden flex flex-col bg-white" style={{ width: `${notesWidth}%` }}>
            <NotePanel symbol={decodedSymbol} notes={notes} activeDate={activeDate} onNotesSaved={fetchNotes} onExportPdf={() => exportNotes(decodedSymbol, stocks.find(s => s.symbol === decodedSymbol)?.name ?? "")} />
          </div>
        </div>
      )}
    </div>
  );
}
