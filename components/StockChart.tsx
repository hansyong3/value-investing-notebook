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

type Tooltip = { x: number; y: number; notes: Note[] } | null;

// Extract title (first line) and body snippet from note content
function parseNote(content: string) {
  const lines = content.split("\n");
  const title = lines[0]?.trim() || "（无标题）";
  const body = lines.slice(1).join(" ").trim();
  const snippet = body ? body.slice(0, 20) + (body.length > 20 ? "…" : "") : "";
  return { title, snippet };
}

export default function StockChart({ data, notes, onCrosshairMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const notesRef = useRef<Note[]>(notes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  // Keep notesRef in sync so crosshair handler always has latest notes
  useEffect(() => { notesRef.current = notes; }, [notes]);

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
      // Match notes within ±15 days so weekly/monthly K also works
      const matched = notesRef.current.filter((n) => {
        const diff = Math.abs(new Date(n.date).getTime() - ts);
        return diff <= 15 * 86400000;
      });

      if (matched.length > 0) {
        setTooltip({ x: param.point.x, y: param.point.y, notes: matched });
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
  }, []); // only init once

  // Helper to build marker list
  function buildMarkers(noteList: Note[], barList: Bar[]) {
    return noteList
      .filter((n) => barList.some((b) => b.time === n.date))
      .map((n) => ({
        time: n.date,
        position: "belowBar" as const,
        color: "#3b82f6",
        shape: "circle" as const,
        text: "",
        size: 0.6,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();

    const markers = buildMarkers(notesRef.current, data);
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    } else {
      markersPluginRef.current = createSeriesMarkers(seriesRef.current, markers);
    }
  }, [data]);

  // Update markers when notes change without re-creating
  useEffect(() => {
    if (!markersPluginRef.current || data.length === 0) return;
    const markers = buildMarkers(notes, data);
    markersPluginRef.current.setMarkers(markers);
  }, [notes]);

  const containerW = containerRef.current?.clientWidth ?? 600;
  const tooltipLeft = tooltip
    ? (tooltip.x + 220 > containerW ? tooltip.x - 224 : tooltip.x + 10)
    : 0;
  const tooltipTop = tooltip ? Math.max(8, tooltip.y - 20) : 0;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {tooltip && (
        <div
          className="absolute z-20 bg-white border border-blue-200 rounded-xl shadow-xl pointer-events-none"
          style={{ left: tooltipLeft, top: tooltipTop, minWidth: 180, maxWidth: 220 }}
        >
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
