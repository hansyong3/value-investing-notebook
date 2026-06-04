import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const range = searchParams.get("range") || "2y";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No data");

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators.quote[0];

    const bars = timestamps.map((ts: number, i: number) => ({
      time: new Date(ts * 1000).toISOString().split("T")[0],
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i],
    })).filter((b: { close: number }) => b.close != null);

    return NextResponse.json(bars);
  } catch (e) {
    console.error("Price fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
  }
}
