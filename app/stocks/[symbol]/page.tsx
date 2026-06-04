"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import NotePanel from "@/components/NotePanel";
import Link from "next/link";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string; images: { id: number; url: string }[] };

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
  const [bars, setBars] = useState<Bar[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [interval, setInterval] = useState("1d");
  const [range, setRange] = useState("2y");
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(async () => {
    const res = await fetch(`/api/price?symbol=${symbol}&interval=${interval}&range=${range}`);
    const data = await res.json();
    if (Array.isArray(data)) setBars(data.filter((b: Bar) => b.close != null));
  }, [symbol, interval, range]);

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/notes?symbol=${symbol}`);
    const data = await res.json();
    if (Array.isArray(data)) setNotes(data);
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPrice(), fetchNotes()]).finally(() => setLoading(false));
  }, [fetchPrice, fetchNotes]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="text-gray-500 hover:text-white transition-colors">
          ← 返回
        </Link>
        <h1 className="font-semibold text-lg">{decodeURIComponent(symbol)}</h1>

        <div className="ml-auto flex items-center gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => setInterval(i.value)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                interval === i.value ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {i.label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-700 mx-2" />
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                range === r.value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart - left 60% */}
        <div className="flex-[3] relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
              <div className="text-gray-400 text-sm">加载中...</div>
            </div>
          )}
          <StockChart data={bars} onCrosshairMove={setActiveDate} />
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-800 flex-shrink-0" />

        {/* Notes - right 40% */}
        <div className="flex-[2] overflow-hidden flex flex-col">
          <NotePanel
            symbol={decodeURIComponent(symbol)}
            notes={notes}
            activeDate={activeDate}
            onNotesSaved={fetchNotes}
          />
        </div>
      </div>
    </div>
  );
}
