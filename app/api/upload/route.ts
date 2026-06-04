import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { noteImages } from "@/db/schema";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const noteId = Number(form.get("noteId"));

  if (!file || !noteId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const blob = await put(`notes/${noteId}/${Date.now()}-${file.name}`, file, { access: "public" });

  const [image] = await db
    .insert(noteImages)
    .values({ noteId, url: blob.url })
    .returning();

  return NextResponse.json(image);
}
