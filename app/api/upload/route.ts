import { NextResponse } from "next/server";
import { db } from "@/db";
import { noteImages } from "@/db/schema";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const noteId = Number(form.get("noteId"));

  if (!file || !noteId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Convert to base64 data URI and store in DB (no external storage needed)
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  const [image] = await db
    .insert(noteImages)
    .values({ noteId, url: dataUrl })
    .returning();

  return NextResponse.json(image);
}
