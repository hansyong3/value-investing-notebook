import { NextResponse } from "next/server";

// stooq.com: free, no API key, returns CSV
// US stocks: AAPL.US, HK stocks: 0700.HK, CN stocks: 600519.CN
function toStooqSymbol(symbol: string) {
  // If already has dot suffix, use as-is
  if (symbol.includes(".")) return symbol.toLowerCase();
  // Default to US market
  return `${symbol.toLowerCase()}.us`;
}

function intervalToStooq(interval: string) {
  if (interval === "1wk") return "w";
  if (interval === "1mo") return "m";
  return "d";
}

function rangeToDate(range: string): string {
  const days: Record<string, number> = {
    "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
  };
  const d = new Date(Date.now() - (days[range] ?? 730) * 86400000);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const range = searchParams.get("range") || "2y";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const stooqSymbol = toStooqSymbol(symbol);
  const i = intervalToStooq(interval);
  const d1 = rangeToDate(range);
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&d1=${d1}&d2=${today}&i=${i}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });

    const text = await res.text();

    // stooq returns "No data" or CSV
    if (!text || text.trim() === "No data" || !text.includes(",")) {
      return NextResponse.json({ error: "No data from stooq" }, { status: 404 });
    }

    const lines = text.trim().split("\n").slice(1); // skip header
    const bars = lines
      .map((line) => {
        const [date, open, high, low, close, volume] = line.split(",");
        return {
          time: date?.trim(),
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
          volume: parseInt(volume ?? "0"),
        };
      })
      .filter((b) => b.time && !isNaN(b.close))
      .sort((a, b) => a.time.localeCompare(b.time));

    return NextResponse.json(bars);
  } catch (e) {
    console.error("Price fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
  }
}
