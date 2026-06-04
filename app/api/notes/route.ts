import { NextResponse } from "next/server";
import { db } from "@/db";
import { notes, noteImages, stocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json([]);

  const allNotes = await db.select().from(notes).where(eq(notes.stockId, stock.id)).orderBy(notes.date);
  const allImages = await db.select().from(noteImages);

  const result = allNotes.map((note) => ({
    ...note,
    images: allImages.filter((img) => img.noteId === note.id),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { symbol, date, content } = await req.json();
  if (!symbol || !date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json({ error: "Stock not found" }, { status: 404 });

  // Upsert: if note for this date exists, update; else insert
  const existing = await db
    .select()
    .from(notes)
    .where(and(eq(notes.stockId, stock.id), eq(notes.date, date)));

  let note;
  if (existing.length > 0) {
    [note] = await db
      .update(notes)
      .set({ content, updatedAt: new Date() })
      .where(eq(notes.id, existing[0].id))
      .returning();
  } else {
    [note] = await db
      .insert(notes)
      .values({ stockId: stock.id, date, content: content || "" })
      .returning();
  }

  return NextResponse.json(note);
}
