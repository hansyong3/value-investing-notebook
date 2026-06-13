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
  const res = await fetch(`/api/notes?symbol=${symbol}`);
  const notes: Note[] = await res.json();
  if (!notes.length) { alert("没有笔记可导出"); return; }

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
      <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #f0f0f0;">
        <div style="font-size:11px;color:#aaa;margin-bottom:6px;font-family:monospace;">
          ${note.starred ? '<span style="color:#f59e0b;">★</span> ' : ''}${note.date}
        </div>
        ${title ? `<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:8px;line-height:1.4;">${title}</div>` : ""}
        ${cleanBody ? `<div style="font-size:14px;color:#333;line-height:1.75;">${cleanBody}</div>` : ""}
      </div>`;
  }).join("");

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:794px;background:#fff;padding:40px 60px;font-family:'PingFang SC','Microsoft YaHei',Arial,sans-serif;color:#111;box-sizing:border-box;";
  container.innerHTML = `
    <div style="margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #111;">
      <div style="font-size:10px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">价值投资笔记</div>
      <div style="font-size:32px;font-weight:900;line-height:1.1;">${symbol}</div>
      ${stockName ? `<div style="font-size:16px;color:#666;margin-top:4px;">${stockName}</div>` : ""}
      <div style="font-size:10px;color:#aaa;margin-top:10px;">导出日期：${new Date().toLocaleDateString("zh-CN")} · 共 ${sorted.length} 条</div>
    </div>
    ${notesHtml}
  `;
  document.body.appendChild(container);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let yPosition = 0;
    pdf.addImage(imgData, "PNG", 0, yPosition, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      yPosition -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, yPosition, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${symbol}-投资笔记.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

const INTERVALS = [{ label: "日K", value: "1d" }, { label: "周K", value: "1wk" }, { label: "月K", value: "1mo" }];
const RANGES = [{ label: "3月", value: "3mo" }, { label: "6月", value: "6mo" }, { label: "1年", value: "1y" }, { label: "2年", value: "2y" }, { label: "5年", value: "5y" }, { label: "10年", value: "10y" }];

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const router = useRouter();
  const decodedSymbol = decodeURIComponent(symbol);

  // Resizable notes panel
  const [notesWidth, setNotesWidth] = useState(52); // percent
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

  // Wealth manager investment targets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wealthTargets, setWealthTargets] = useState<any[]>([]);

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

  const fetchWealthTargets = useCallback(async () => {
    try {
      const stockName = stocks.find(s => s.symbol === decodedSymbol)?.name ?? '';
      const res = await fetch(`/api/wealth-target?ticker=${encodeURIComponent(decodedSymbol)}&name=${encodeURIComponent(stockName)}`);
      if (res.ok) setWealthTargets(await res.json());
    } catch { /* ignore */ }
  }, [decodedSymbol, stocks]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);
  useEffect(() => { fetchPrice(); fetchNotes(); fetchHoldings(); fetchWealthTargets(); }, [fetchPrice, fetchNotes, fetchHoldings, fetchWealthTargets]);

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
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hans价值投资</span>
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
          <Link href="/tags"
            className="w-full text-xs text-gray-400 hover:text-purple-600 py-1.5 flex items-center justify-center gap-1 transition-colors">
            🏷️ 标签视图
          </Link>
          <Link href="/backup"
            className="w-full text-xs text-gray-300 hover:text-gray-500 py-1.5 flex items-center justify-center gap-1 transition-colors border-t border-gray-100 mt-1 pt-2">
            🔒 备份 / 恢复数据
          </Link>
        </div>
      </aside>

      {stocks.find(s => s.symbol === decodedSymbol)?.notebook ? (
        /* NOTES: full-width notes only, no chart */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
          <NotePanel symbol={decodedSymbol} notes={notes} activeDate={null} onNotesSaved={fetchNotes} onExportPdf={() => exportNotes(decodedSymbol, stocks.find(s => s.symbol === decodedSymbol)?.name ?? "")} notebooks={stocks.filter(s => s.notebook)} centered />
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

            {/* Wealth Manager Targets */}
            {wealthTargets.length > 0 && (
              <div className="border-t border-gray-200 overflow-y-auto" style={{ maxHeight: 180 }}>
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">我的目标（财富管理）</span>
                </div>
                {wealthTargets.map((t, i) => (
                  <div key={i} className="px-3 py-2 border-b border-gray-100 text-xs">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {t.bucket && <span className="text-gray-400">{t.bucket}</span>}
                      {t.tier && <span className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.tier}</span>}
                      {t.certainty && (
                        <span className={`px-1.5 py-0.5 rounded font-medium ${t.certainty === '高' ? 'bg-green-50 text-green-700' : t.certainty === '中' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-600'}`}>
                          确定性 {t.certainty}
                        </span>
                      )}
                      {t.odds && (
                        <span className={`px-1.5 py-0.5 rounded font-medium ${t.odds === '高' ? 'bg-green-50 text-green-700' : t.odds === '中' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-600'}`}>
                          赔率 {t.odds}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-gray-700">
                      {t.targetShares && <span>目标股数 <strong>{t.targetShares}</strong></span>}
                      {t.targetPrice && (
                        <span className={latestPrice && parseFloat(t.targetPrice) >= latestPrice ? 'text-green-600 font-semibold' : ''}>
                          可买入价 <strong>{t.targetPrice}</strong>
                          {latestPrice && parseFloat(t.targetPrice) >= latestPrice && ' ✓'}
                        </span>
                      )}
                      {t.excitingPrice && <span>激动价 <strong>{t.excitingPrice}</strong></span>}
                    </div>
                    {t.notes && <p className="text-gray-400 mt-1">{t.notes}</p>}
                  </div>
                ))}
              </div>
            )}
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
            <NotePanel symbol={decodedSymbol} notes={notes} activeDate={activeDate} onNotesSaved={fetchNotes} onExportPdf={() => exportNotes(decodedSymbol, stocks.find(s => s.symbol === decodedSymbol)?.name ?? "")} notebooks={stocks.filter(s => s.notebook)} />
          </div>
        </div>
      )}
    </div>
  );
}
