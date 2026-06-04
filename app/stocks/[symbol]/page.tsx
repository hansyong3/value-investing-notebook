"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import NotePanel from "@/components/NotePanel";
import Link from "next/link";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string; images: { id: number; url: string }[] };
type Stock = { id: number; symbol: string; name: string };

const INTERVALS = [
  { label: "日K", value: "1d" },
  { label: "周K", value: "1wk" },
  { label: "月K", value: "1mo" },
];
const RANGES = [
  { label: "3个月", value: "3mo" },
  { label: "6个月", value: "6mo" },
  { label: "1年", value: "1y" },
  { label: "2年", value: "2y" },
  { label: "5年", value: "5y" },
];

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const router = useRouter();
  const [bars, setBars] = useState<Bar[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [interval, setInterval] = useState("1d");
  const [range, setRange] = useState("2y");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);

  const decodedSymbol = decodeURIComponent(symbol);

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
      } else {
        setChartError(true);
      }
    } catch {
      setChartError(true);
    } finally {
      setChartLoading(false);
    }
  }, [decodedSymbol, interval, range]);

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/notes?symbol=${decodedSymbol}`);
    const data = await res.json();
    if (Array.isArray(data)) setNotes(data);
  }, [decodedSymbol]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);
  useEffect(() => { fetchPrice(); fetchNotes(); }, [fetchPrice, fetchNotes]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Top toolbar */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0 h-12">
        <Link href="/" className="text-gray-500 hover:text-white transition-colors text-sm">← 返回</Link>
        <div className="w-px h-4 bg-gray-700" />
        <span className="font-mono font-semibold text-blue-400">{decodedSymbol}</span>
        <span className="text-gray-500 text-sm">
          {stocks.find(s => s.symbol === decodedSymbol)?.name}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {INTERVALS.map((i) => (
            <button key={i.value} onClick={() => setInterval(i.value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${interval === i.value ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {i.label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-700 mx-1" />
          {RANGES.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${range === r.value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar: stock list */}
        <aside className="w-44 flex-shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-950">
          <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider">观察清单</div>
          {stocks.map((stock) => (
            <button
              key={stock.id}
              onClick={() => router.push(`/stocks/${stock.symbol}`)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                stock.symbol === decodedSymbol
                  ? "bg-blue-600/20 border-r-2 border-blue-500"
                  : "hover:bg-gray-800"
              }`}
            >
              <div className={`font-mono text-sm font-semibold ${stock.symbol === decodedSymbol ? "text-blue-400" : "text-gray-200"}`}>
                {stock.symbol}
              </div>
              <div className="text-xs text-gray-500 truncate">{stock.name}</div>
            </button>
          ))}
          <Link href="/" className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-gray-600 hover:text-gray-400 transition-colors border-t border-gray-800 mt-1">
            + 添加股票
          </Link>
        </aside>

        {/* Chart */}
        <div className="flex-[3] relative">
          {chartLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
              <div className="text-gray-400 text-sm">加载行情数据...</div>
            </div>
          )}
          {chartError && !chartLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
              <p className="text-gray-500 text-sm">行情数据加载失败</p>
              <button onClick={fetchPrice} className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 px-3 py-1.5 rounded transition-colors">
                重试
              </button>
            </div>
          )}
          <StockChart data={bars} onCrosshairMove={setActiveDate} />
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-800 flex-shrink-0" />

        {/* Notes */}
        <div className="flex-[2] overflow-hidden flex flex-col">
          <NotePanel
            symbol={decodedSymbol}
            notes={notes}
            activeDate={activeDate}
            onNotesSaved={fetchNotes}
          />
        </div>
      </div>
    </div>
  );
}
