import { NextResponse } from "next/server";

const AV_KEY = process.env.ALPHA_VANTAGE_KEY!;

function avFunction(interval: string) {
  if (interval === "1wk") return "TIME_SERIES_WEEKLY";
  if (interval === "1mo") return "TIME_SERIES_MONTHLY";
  return "TIME_SERIES_DAILY";
}

function avKey(interval: string) {
  if (interval === "1wk") return "Weekly Time Series";
  if (interval === "1mo") return "Monthly Time Series";
  return "Time Series (Daily)";
}

function daysForRange(range: string) {
  const map: Record<string, number> = {
    "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
  };
  return map[range] ?? 730;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const range = searchParams.get("range") || "2y";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  if (!AV_KEY) return NextResponse.json({ error: "Missing ALPHA_VANTAGE_KEY env var" }, { status: 500 });

  const fn = avFunction(interval);
  const seriesKey = avKey(interval);
  const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${AV_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const json = await res.json();

    if (json["Note"] || json["Information"]) {
      return NextResponse.json({ error: "API rate limit reached" }, { status: 429 });
    }

    const series = json[seriesKey];
    if (!series) return NextResponse.json({ error: "No data" }, { status: 404 });

    const cutoff = new Date(Date.now() - daysForRange(range) * 86400000).toISOString().split("T")[0];

    const bars = Object.entries(series)
      .filter(([date]) => date >= cutoff)
      .map(([date, v]: [string, unknown]) => {
        const vals = v as Record<string, string>;
        return {
          time: date,
          open: parseFloat(vals["1. open"]),
          high: parseFloat(vals["2. high"]),
          low: parseFloat(vals["3. low"]),
          close: parseFloat(vals["4. close"]),
          volume: parseInt(vals["5. volume"] ?? "0"),
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    return NextResponse.json(bars);
  } catch (e) {
    console.error("Price fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
  }
}
