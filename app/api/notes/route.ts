import { NextResponse } from "next/server";
import { db } from "@/db";
import { notes, noteImages, stocks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json([]);

  const allNotes = await db.select().from(notes).where(eq(notes.stockId, stock.id)).orderBy(notes.createdAt);
  const allImages = await db.select().from(noteImages);

  const result = allNotes.map((note) => ({
    ...note,
    images: allImages.filter((img) => img.noteId === note.id),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { symbol, date, content, id, starred } = body;

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol.toUpperCase()));
  if (!stock) return NextResponse.json({ error: "Stock not found" }, { status: 404 });

  // Update existing note
  if (id) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (content !== undefined) updates.content = content;
    if (starred !== undefined) updates.starred = starred;
    const [note] = await db.update(notes).set(updates).where(eq(notes.id, id)).returning();
    return NextResponse.json(note);
  }

  // Insert new note
  const [note] = await db
    .insert(notes)
    .values({ stockId: stock.id, date, content: content || "", starred: false })
    .returning();
  return NextResponse.json(note);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(notes).where(eq(notes.id, id));
  return NextResponse.json({ ok: true });
}
