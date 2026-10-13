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
  // Rename, toggle notebook, or set price levels: { id, name?, notebook?, fairPrice?, buyPrice? }
  if (body.id && ["name", "notebook", "fairPrice", "buyPrice"].some(k => body[k] !== undefined)) {
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.notebook !== undefined) updates.notebook = body.notebook;
    for (const k of ["fairPrice", "buyPrice"] as const) {
      if (body[k] === undefined) continue;
      const n = body[k] === null || body[k] === "" ? null : Number(body[k]);
      if (n !== null && !(n > 0)) return NextResponse.json({ error: `${k} must be a positive number` }, { status: 400 });
      updates[k] = n === null ? null : String(n);
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
