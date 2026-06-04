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
  // Rename: { id, name }
  if (body.id && body.name !== undefined) {
    const [stock] = await db.update(stocks).set({ name: body.name }).where(eq(stocks.id, body.id)).returning();
    return NextResponse.json(stock);
  }
  // Reorder: { orders: [{id, order}] }
  if (body.orders) {
    await Promise.all(
      body.orders.map(({ id, order }: { id: number; order: number }) =>
        db.update(stocks).set({ order }).where(eq(stocks.id, id))
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
