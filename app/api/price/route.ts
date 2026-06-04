import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = (searchParams.get("interval") || "1d") as "1d" | "1wk" | "1mo";
  const range = searchParams.get("range") || "2y";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const rangeMap: Record<string, Date> = {
      "3mo": new Date(Date.now() - 90 * 86400000),
      "6mo": new Date(Date.now() - 180 * 86400000),
      "1y":  new Date(Date.now() - 365 * 86400000),
      "2y":  new Date(Date.now() - 730 * 86400000),
      "5y":  new Date(Date.now() - 1825 * 86400000),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yahooFinance as any).chart(symbol, {
      period1: rangeMap[range] ?? new Date(Date.now() - 730 * 86400000),
      interval,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (result.quotes as any[]).map((q) => ({
      time: new Date(q.date).toISOString().split("T")[0],
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    }));

    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
  }
}
