import { NextResponse } from "next/server";
import { db } from "@/db";
import { holdings, stocks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json([]);

  const rows = await db.select().from(holdings).where(eq(holdings.stockId, stock.id)).orderBy(holdings.date);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { symbol, type, date, shares, price, currency, fee, note } = await req.json();
  if (!symbol || !type || !date || !shares || !price) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json({ error: "Stock not found" }, { status: 404 });

  const [row] = await db.insert(holdings).values({
    stockId: stock.id,
    type,
    date,
    shares: String(shares),
    price: String(price),
    currency: currency || "USD",
    fee: String(fee || 0),
    note: note || "",
  }).returning();

  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(holdings).where(eq(holdings.id, id));
  return NextResponse.json({ ok: true });
}
