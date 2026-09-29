import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { actionLog, stocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function getStockId(symbol: string): Promise<number | null> {
  const rows = await db.select({ id: stocks.id }).from(stocks).where(eq(stocks.symbol, symbol)).limit(1);
  return rows[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const stockId = await getStockId(symbol);
  if (!stockId) return NextResponse.json([]);

  const rows = await db.select().from(actionLog).where(eq(actionLog.stockId, stockId)).orderBy(actionLog.date);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { symbol, date, target, action, price, quantity, note } = body;
  if (!symbol || !date) return NextResponse.json({ error: "symbol and date required" }, { status: 400 });

  const stockId = await getStockId(symbol);
  if (!stockId) return NextResponse.json({ error: "stock not found" }, { status: 404 });

  const [row] = await db.insert(actionLog).values({ stockId, date, target: target ?? "", action: action ?? "买入", price: price ?? "0", quantity: quantity ?? "0", note: note ?? "" }).returning();
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, date, target, action, price, quantity, note } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Partial<{ date: string; target: string; action: string; price: string; quantity: string; note: string }> = {};
  if (date !== undefined) updates.date = date;
  if (target !== undefined) updates.target = target;
  if (action !== undefined) updates.action = action;
  if (price !== undefined) updates.price = price;
  if (quantity !== undefined) updates.quantity = quantity;
  if (note !== undefined) updates.note = note;

  const [row] = await db.update(actionLog).set(updates).where(eq(actionLog.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.delete(actionLog).where(eq(actionLog.id, id));
  return NextResponse.json({ ok: true });
}
