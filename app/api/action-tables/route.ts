import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { actionTables, stocks } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const rows = await db.select().from(actionTables).where(eq(actionTables.stockId, stockId)).orderBy(actionTables.createdAt);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { symbol, title } = await req.json();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const stockId = await getStockId(symbol);
  if (!stockId) return NextResponse.json({ error: "stock not found" }, { status: 404 });
  const [row] = await db.insert(actionTables).values({ stockId, title: title ?? "行动记录" }).returning();
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, title } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const [row] = await db.update(actionTables).set({ title }).where(eq(actionTables.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(actionTables).where(eq(actionTables.id, id));
  return NextResponse.json({ ok: true });
}
