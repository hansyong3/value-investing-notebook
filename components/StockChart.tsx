"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers, type IChartApi, type ISeriesApi } from "lightweight-charts";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Note = { id: number; date: string; content: string };

type Props = {
  data: Bar[];
  notes: Note[];
  onCrosshairMove: (date: string | null) => void;
};

type Tooltip = { x: number; y: number; note: Note } | null;

export default function StockChart({ data, notes, onCrosshairMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);

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

      if (!date || !param.point) {
        setTooltip(null);
        return;
      }

      // Find note within ±3 days
      const ts = new Date(date).getTime();
      const match = notes.find((n) => {
        const diff = Math.abs(new Date(n.date).getTime() - ts);
        return diff <= 3 * 86400000;
      });

      if (match) {
        setTooltip({ x: param.point.x, y: param.point.y, note: match });
      } else {
        setTooltip(null);
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [notes]);  // re-init when notes change so markers update

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();

    // Add note markers
    const markers = notes
      .filter((n) => data.some((b) => b.time === n.date))
      .map((n) => ({
        time: n.date,
        position: "belowBar" as const,
        color: "#3b82f6",
        shape: "circle" as const,
        text: "",
        size: 0.6,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    createSeriesMarkers(seriesRef.current, markers);
  }, [data, notes]);

  // Tooltip position: clamp so it doesn't go off-screen
  const containerW = containerRef.current?.clientWidth ?? 600;
  const tooltipLeft = tooltip ? (tooltip.x + 160 > containerW ? tooltip.x - 164 : tooltip.x + 8) : 0;
  const tooltipTop = tooltip ? Math.max(8, tooltip.y - 20) : 0;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {tooltip && (
        <div
          className="absolute z-20 bg-white border border-blue-200 rounded-lg shadow-lg px-3 py-2 max-w-[200px] pointer-events-none"
          style={{ left: tooltipLeft, top: tooltipTop }}
        >
          <div className="text-xs font-medium text-blue-600 mb-1">{tooltip.note.date}</div>
          <div className="text-xs text-gray-700 line-clamp-3 leading-relaxed whitespace-pre-wrap">
            {tooltip.note.content || "（空笔记）"}
          </div>
        </div>
      )}
    </div>
  );
}
