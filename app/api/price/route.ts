export const runtime = "edge";

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const range = searchParams.get("range") || "2y";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  // Normalize HK stock symbols: Yahoo Finance uses 0700.HK not 00700.HK
  function normalizeSymbol(s: string) {
    const upper = s.toUpperCase();
    if (upper.endsWith(".HK")) {
      const code = upper.slice(0, -3).replace(/^0+/, "") || "0";
      // HK stocks are 4 digits, pad with zeros
      return code.padStart(4, "0") + ".HK";
    }
    return upper;
  }
  const normalized = normalizeSymbol(symbol);

  // Try multiple Yahoo Finance endpoints
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?interval=${interval}&range=${range}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?interval=${interval}&range=${range}&includePrePost=false`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com/",
          "Origin": "https://finance.yahoo.com",
        },
      });

      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp) continue;

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators.quote[0];

      const bars = timestamps
        .map((ts: number, i: number) => ({
          time: new Date(ts * 1000).toISOString().split("T")[0],
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume?.[i] ?? 0,
        }))
        .filter((b) => b.close != null && !isNaN(b.close));

      return NextResponse.json(bars);
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
}
