import { NextResponse } from "next/server";
import { db } from "@/db";
import { noteTags } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET: fetch all tags for a note
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noteId = Number(searchParams.get("noteId"));
  if (!noteId) return NextResponse.json({ error: "Missing noteId" }, { status: 400 });
  const rows = await db.select().from(noteTags).where(eq(noteTags.noteId, noteId));
  return NextResponse.json(rows);
}

// POST: add tag to note
export async function POST(req: Request) {
  const { noteId, tagId } = await req.json();
  if (!noteId || !tagId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  // upsert — ignore if already exists
  const existing = await db.select().from(noteTags).where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)));
  if (existing.length > 0) return NextResponse.json(existing[0]);
  const [row] = await db.insert(noteTags).values({ noteId, tagId }).returning();
  return NextResponse.json(row);
}

// DELETE: remove tag from note
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const noteId = Number(searchParams.get("noteId"));
  const tagId = Number(searchParams.get("tagId"));
  if (!noteId || !tagId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  await db.delete(noteTags).where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)));
  return NextResponse.json({ ok: true });
}
