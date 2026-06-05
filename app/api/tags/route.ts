import { NextResponse } from "next/server";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(tags).orderBy(tags.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const [tag] = await db.insert(tags).values({ name: name.trim(), color: color || "#6b7280" }).returning();
  return NextResponse.json(tag);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(tags).where(eq(tags.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { id, name, color } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (color !== undefined) updates.color = color;
  const [tag] = await db.update(tags).set(updates).where(eq(tags.id, id)).returning();
  return NextResponse.json(tag);
}
