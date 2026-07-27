import { NextResponse } from "next/server";

const CK_BASE = "https://compound-knowledge-delta.vercel.app";

// GET /api/ck-proxy?path=/api/books  → proxy to compound-knowledge
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const res = await fetch(`${CK_BASE}${path}`, { next: { revalidate: 0 } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST /api/ck-proxy?path=/api/books/5/notes  → proxy to compound-knowledge
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const body = await req.json();
  const res = await fetch(`${CK_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
