"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers, type IChartApi, type ISeriesApi } from "lightweight-charts";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string };
type Props = { data: Bar[]; notes: Note[]; onCrosshairMove: (date: string | null) => void };
type Tooltip = { x: number; y: number; notes: Note[] } | null;

function parseNote(content: string) {
  const idx = content.indexOf("\n");
  const title = (idx === -1 ? content : content.slice(0, idx)).trim() || "（无标题）";
  const body = idx === -1 ? "" : content.slice(idx + 1).trim();
  const snippet = body ? body.slice(0, 30) + (body.length > 30 ? "…" : "") : "";
  return { title, snippet };
}

export default function StockChart({ data, notes, onCrosshairMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const notesRef = useRef<Note[]>(notes);
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  notesRef.current = notes;

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#ffffff" }, textColor: "#374151" },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      timeScale: { borderColor: "#e5e7eb", timeVisible: true },
      rightPriceScale: { borderColor: "#e5e7eb" },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a", downColor: "#dc2626",
      borderUpColor: "#16a34a", borderDownColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const date = param.time ? (param.time as string) : null;
      onCrosshairMove(date);
      if (!date || !param.point) { setTooltip(null); return; }
      const ts = new Date(date).getTime();
      const matched = notesRef.current.filter(n => Math.abs(new Date(n.date).getTime() - ts) <= 3 * 86400000);
      setTooltip(matched.length > 0 ? { x: param.point.x, y: param.point.y, notes: matched } : null);
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); markersRef.current = null; };
  }, []);

  // Update data + markers whenever data or notes change
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
    updateMarkers(data, notes);
  }, [data, notes]);

  function updateMarkers(barList: Bar[], noteList: Note[]) {
    if (!seriesRef.current) return;
    // Snap each note to nearest bar date
    const markers: { time: string; position: "belowBar"; color: string; shape: "circle"; text: string; size: number }[] = [];
    const seen = new Set<string>();
    for (const n of noteList) {
      const ts = new Date(n.date).getTime();
      let nearest = ""; let minDiff = Infinity;
      for (const b of barList) {
        const d = Math.abs(new Date(b.time).getTime() - ts);
        if (d < minDiff) { minDiff = d; nearest = b.time; }
      }
      if (nearest && !seen.has(nearest)) {
        seen.add(nearest);
        markers.push({ time: nearest, position: "belowBar", color: "#3b82f6", shape: "circle", text: "", size: 0.8 });
      }
    }
    markers.sort((a, b) => a.time.localeCompare(b.time));

    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    } else {
      markersRef.current = createSeriesMarkers(seriesRef.current, markers);
    }
  }

  const containerW = containerRef.current?.clientWidth ?? 600;
  const left = tooltip ? (tooltip.x + 230 > containerW ? tooltip.x - 234 : tooltip.x + 10) : 0;
  const top = tooltip ? Math.max(8, tooltip.y - 10) : 0;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {tooltip && (
        <div className="absolute z-20 bg-white border border-blue-200 rounded-xl shadow-xl pointer-events-none"
          style={{ left, top, minWidth: 160, maxWidth: 220 }}>
          {tooltip.notes.map((note) => {
            const { title, snippet } = parseNote(note.content);
            return (
              <div key={note.id} className="px-3 py-2 border-b border-gray-100 last:border-0">
                <div className="text-[10px] text-gray-400 mb-0.5">{note.date}</div>
                <div className="text-sm font-bold text-gray-800 leading-snug">{title}</div>
                {snippet && <div className="text-xs text-gray-500 mt-0.5">{snippet}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
