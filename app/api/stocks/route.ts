import { NextResponse } from "next/server";
import { db } from "@/db";
import { stocks } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(stocks).orderBy(asc(stocks.order), asc(stocks.symbol));
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const { symbol, name, notebook } = await req.json();
  if (!symbol || !name) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const [stock] = await db
    .insert(stocks)
    .values({ symbol: symbol.toUpperCase(), name, notebook: !!notebook })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json(stock);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  // Rename, toggle notebook, or set price levels: { id, name?, notebook?, fairPrice?, marginOfSafety? }
  // fairPrice = 内在价值; buyPrice is derived: 内在价值 × (1 − 安全边际%)
  if (body.id && ["name", "notebook", "fairPrice", "marginOfSafety"].some(k => body[k] !== undefined)) {
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.notebook !== undefined) updates.notebook = body.notebook;
    const parse = (v: unknown) => (v === null || v === "" ? null : Number(v));
    if (body.fairPrice !== undefined) {
      const n = parse(body.fairPrice);
      if (n !== null && !(n > 0)) return NextResponse.json({ error: "内在价值须为正数" }, { status: 400 });
      updates.fairPrice = n === null ? null : String(n);
    }
    if (body.marginOfSafety !== undefined) {
      const n = parse(body.marginOfSafety);
      if (n !== null && !(n >= 0 && n < 100)) return NextResponse.json({ error: "安全边际须在 0–99.99% 之间" }, { status: 400 });
      updates.marginOfSafety = n === null ? null : String(n);
    }
    if (body.fairPrice !== undefined || body.marginOfSafety !== undefined) {
      const [cur] = await db.select().from(stocks).where(eq(stocks.id, body.id));
      if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const fair = "fairPrice" in updates ? (updates.fairPrice as string | null) : cur.fairPrice;
      const margin = "marginOfSafety" in updates ? (updates.marginOfSafety as string | null) : cur.marginOfSafety;
      if (fair != null && margin != null) {
        updates.buyPrice = (Number(fair) * (1 - Number(margin) / 100)).toFixed(4);
      } else if (body.fairPrice !== undefined && fair == null) {
        updates.buyPrice = null; // 内在价值 cleared → no buy price
      }
    }
    const [stock] = await db.update(stocks).set(updates).where(eq(stocks.id, body.id)).returning();
    return NextResponse.json(stock);
  }
  // Reorder: { orders: [{id, order}] }
  if (body.orders) {
    await Promise.all(
      body.orders.map(({ id, order, holding }: { id: number; order: number; holding?: boolean }) =>
        db.update(stocks).set(holding === undefined ? { order } : { order, holding }).where(eq(stocks.id, id))
      )
    );
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(stocks).where(eq(stocks.id, id));
  return NextResponse.json({ ok: true });
}
