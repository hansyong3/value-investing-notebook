import { NextResponse } from "next/server";
import { db } from "@/db";
import { notes, stocks } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

// Lightweight feed for the 投资日记回顾 popup. Images are stripped inside
// Postgres so the multi‑MB base64 data never leaves the database.

async function findDiaryStock() {
  const books = await db
    .select({ id: stocks.id, symbol: stocks.symbol, name: stocks.name })
    .from(stocks)
    .where(eq(stocks.notebook, true))
    .orderBy(asc(stocks.order), asc(stocks.symbol));
  return books.find(b => b.name.includes("日记")) ?? books[0] ?? null;
}

export async function GET() {
  const diary = await findDiaryStock();
  if (!diary) return NextResponse.json({ notes: [] });

  const rows = await db
    .select({
      id: notes.id,
      date: notes.date,
      content: sql<string>`regexp_replace(${notes.content}, '<img[^>]*>', '', 'gi')`,
    })
    .from(notes)
    .where(eq(notes.stockId, diary.id));

  return NextResponse.json({ notes: rows });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Append a postscript in place (content = content || ps), so the note's
// existing text and images are never rewritten.
export async function POST(req: Request) {
  const { id, text, date } = await req.json();
  const body = typeof text === "string" ? text.trim() : "";
  if (!Number.isInteger(id) || !body) return NextResponse.json({ error: "Missing id or text" }, { status: 400 });
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);

  const diary = await findDiaryStock();
  if (!diary) return NextResponse.json({ error: "Diary not found" }, { status: 404 });

  const psHtml =
    `<p>---</p><p>附言（${day}）</p>` +
    body.split("\n").map(l => `<p>${escapeHtml(l)}</p>`).join("");

  const updated = await db
    .update(notes)
    .set({ content: sql`${notes.content} || ${psHtml}`, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.stockId, diary.id)))
    .returning({ id: notes.id });

  if (!updated.length) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ psHtml });
}
