"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import NotePanel from "@/components/NotePanel";
import HoldingsPanel from "@/components/HoldingsPanel";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string; images: { id: number; url: string }[] };
type Stock = { id: number; symbol: string; name: string };
type Holding = { id: number; type: string; date: string; shares: string; price: string; currency: string; fee: string; note: string };

const INTERVALS = [{ label: "日K", value: "1d" }, { label: "周K", value: "1wk" }, { label: "月K", value: "1mo" }];
const RANGES = [{ label: "3月", value: "3mo" }, { label: "6月", value: "6mo" }, { label: "1年", value: "1y" }, { label: "2年", value: "2y" }, { label: "5年", value: "5y" }];

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const router = useRouter();
  const decodedSymbol = decodeURIComponent(symbol);

  const [bars, setBars] = useState<Bar[]>([]);
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
      if (Array.isArray(data)) setBars(data);
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
          {stocks.map((stock) => (
            <button key={stock.id} onClick={() => router.push(`/stocks/${stock.symbol}`)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
                stock.symbol === decodedSymbol ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-100"
              }`}>
              <div className={`font-mono text-sm font-semibold ${stock.symbol === decodedSymbol ? "text-blue-600" : "text-gray-800"}`}>
                {stock.symbol}
              </div>
              <div className="text-xs text-gray-400 truncate">{stock.name}</div>
            </button>
          ))}
        </div>

        {/* Add stock */}
        <div className="border-t border-gray-200 p-2">
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
        </div>
      </aside>

      {/* Center: chart + holdings */}
      <div className="flex flex-col flex-[2] min-w-0 border-r border-gray-200">
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

        {/* Chart - 55% height */}
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
          <StockChart data={bars} onCrosshairMove={setActiveDate} />
        </div>

        {/* Holdings - 45% height */}
        <div className="flex-[9] min-h-0 overflow-hidden">
          <HoldingsPanel symbol={decodedSymbol} holdings={holdingsList} onSaved={fetchHoldings} />
        </div>
      </div>

      {/* Right: notes */}
      <div className="flex-[2] min-w-0 overflow-hidden flex flex-col bg-white">
        <NotePanel symbol={decodedSymbol} notes={notes} activeDate={activeDate} onNotesSaved={fetchNotes} />
      </div>
    </div>
  );
}
