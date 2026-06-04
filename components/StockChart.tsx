"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers, type IChartApi, type ISeriesApi } from "lightweight-charts";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string };
type Holding = { id: number; type: string; date: string; shares: string; price: string; currency: string };
type Props = { data: Bar[]; notes: Note[]; holdings?: Holding[]; onCrosshairMove: (date: string | null) => void };

type TooltipNote = { kind: "note"; date: string; title: string; snippet: string };
type TooltipTrade = { kind: "trade"; date: string; type: string; price: string; shares: string; currency: string };
type Tooltip = { x: number; y: number; items: (TooltipNote | TooltipTrade)[] } | null;

function parseNote(content: string) {
  const idx = content.indexOf("\n");
  const title = (idx === -1 ? content : content.slice(0, idx)).trim() || "（无标题）";
  const body = idx === -1 ? "" : content.slice(idx + 1).trim();
  const snippet = body ? body.slice(0, 30) + (body.length > 30 ? "…" : "") : "";
  return { title, snippet };
}

export default function StockChart({ data, notes, holdings = [], onCrosshairMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const notesRef = useRef<Note[]>(notes);
  const holdingsRef = useRef<Holding[]>(holdings);
  const markerDatesRef = useRef<Map<string, Note[]>>(new Map());
  const tradeBarDatesRef = useRef<Map<string, Holding[]>>(new Map());
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  notesRef.current = notes;
  holdingsRef.current = holdings;

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
      const crossTs = new Date(date + "T00:00:00Z").getTime();
      const THREE_DAYS = 3 * 86400000;

      const matchedNotes = notesRef.current.filter(n =>
        Math.abs(new Date(n.date + "T00:00:00Z").getTime() - crossTs) <= THREE_DAYS
      );
      const matchedTrades = holdingsRef.current.filter(h =>
        Math.abs(new Date(h.date + "T00:00:00Z").getTime() - crossTs) <= THREE_DAYS
      );

      const items: (TooltipNote | TooltipTrade)[] = [
        ...matchedNotes.map(n => {
          const { title, snippet } = parseNote(n.content);
          return { kind: "note" as const, date: n.date, title, snippet };
        }),
        ...matchedTrades.map(h => ({
          kind: "trade" as const,
          date: h.date,
          type: h.type,
          price: h.price,
          shares: h.shares,
          currency: h.currency,
        })),
      ];
      setTooltip(items.length > 0 ? { x: param.point.x, y: param.point.y, items } : null);
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); markersRef.current = null; };
  }, []);

  // Update data + markers whenever data, notes, or holdings change
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
    updateMarkers(data, notes, holdings);
  }, [data, notes, holdings]);

  function snapToBar(date: string, barList: Bar[]): string {
    let nearest = ""; let minDiff = Infinity;
    const ts = new Date(date).getTime();
    for (const b of barList) {
      const d = Math.abs(new Date(b.time).getTime() - ts);
      if (d < minDiff) { minDiff = d; nearest = b.time; }
    }
    return nearest;
  }

  function updateMarkers(barList: Bar[], noteList: Note[], holdingList: Holding[]) {
    if (!seriesRef.current) return;

    // Note markers (blue circles below bar)
    const barDateMap = new Map<string, Note[]>();
    for (const n of noteList) {
      const nearest = snapToBar(n.date, barList);
      if (nearest) {
        if (!barDateMap.has(nearest)) barDateMap.set(nearest, []);
        barDateMap.get(nearest)!.push(n);
      }
    }
    markerDatesRef.current = barDateMap;

    // Trade markers (green▲ buy above bar, red▼ sell below bar)
    const tradeMap = new Map<string, Holding[]>();
    for (const h of holdingList) {
      const nearest = snapToBar(h.date, barList);
      if (nearest) {
        if (!tradeMap.has(nearest)) tradeMap.set(nearest, []);
        tradeMap.get(nearest)!.push(h);
      }
    }
    tradeBarDatesRef.current = tradeMap;

    const noteMarkers = Array.from(barDateMap.keys()).map(time => ({
      time, position: "belowBar" as const, color: "#3b82f6", shape: "circle" as const, text: "", size: 0.8,
    }));

    const tradeMarkers = Array.from(tradeMap.entries()).flatMap(([time, hs]) =>
      hs.map(h => ({
        time,
        position: h.type === "buy" ? "belowBar" as const : "aboveBar" as const,
        color: h.type === "buy" ? "#16a34a" : "#dc2626",
        shape: h.type === "buy" ? "arrowUp" as const : "arrowDown" as const,
        text: "",
        size: 1,
      }))
    );

    const allMarkers = [...noteMarkers, ...tradeMarkers]
      .sort((a, b) => a.time.localeCompare(b.time));

    if (markersRef.current) {
      markersRef.current.setMarkers(allMarkers);
    } else {
      markersRef.current = createSeriesMarkers(seriesRef.current, allMarkers);
    }
  }

  const containerW = containerRef.current?.clientWidth ?? 600;
  const left = tooltip ? (tooltip.x + 230 > containerW ? tooltip.x - 234 : tooltip.x + 10) : 0;
  const top = tooltip ? Math.max(8, tooltip.y - 10) : 0;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {tooltip && (
        <div className="absolute z-20 bg-white border border-gray-200 rounded-xl shadow-xl pointer-events-none"
          style={{ left, top, minWidth: 170, maxWidth: 240 }}>
          {tooltip.items.map((item, i) => (
            <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0">
              <div className="text-[10px] text-gray-400 mb-0.5">{item.date}</div>
              {item.kind === "note" ? (
                <>
                  <div className="text-sm font-bold text-blue-700 leading-snug">{item.title}</div>
                  {item.snippet && <div className="text-xs text-gray-500 mt-0.5">{item.snippet}</div>}
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.type === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {item.type === "buy" ? "买入" : "卖出"}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{parseFloat(item.price).toFixed(2)}</span>
                  <span className="text-xs text-gray-400">{item.currency}</span>
                  <span className="text-xs text-gray-400">×{parseFloat(item.shares).toLocaleString()}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
