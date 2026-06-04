import { NextResponse } from "next/server";
import { db } from "@/db";
import { stocks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(stocks).orderBy(stocks.symbol);
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const { symbol, name } = await req.json();
  if (!symbol || !name) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const [stock] = await db
    .insert(stocks)
    .values({ symbol: symbol.toUpperCase(), name })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json(stock);
}
