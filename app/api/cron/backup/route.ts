import { NextResponse } from "next/server";
import { db } from "@/db";
import { stocks, notes, noteImages, holdings } from "@/db/schema";

const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN!;
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO!; // e.g. "hansyong3/investing-data-backup"
const FILE_PATH = "backup.json";

export async function GET(req: Request) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({ error: "Missing GitHub env vars" }, { status: 500 });
  }

  // Fetch all data
  const [allStocks, allNotes, allImages, allHoldings] = await Promise.all([
    db.select().from(stocks),
    db.select().from(notes),
    db.select().from(noteImages),
    db.select().from(holdings),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stocks: allStocks,
    notes: allNotes,
    noteImages: allImages,
    holdings: allHoldings,
  };

  const content = Buffer.from(JSON.stringify(backup, null, 2)).toString("base64");

  // Get current file SHA (needed for update)
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  let sha: string | undefined;
  try {
    const existing = await fetch(apiBase, { headers });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch { /* file doesn't exist yet */ }

  // Commit to GitHub
  const body: Record<string, string> = {
    message: `Auto backup ${new Date().toISOString().split("T")[0]}`,
    content,
    branch: "main",
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiBase, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "GitHub push failed", detail: err }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    backedUpAt: backup.exportedAt,
    counts: { stocks: allStocks.length, notes: allNotes.length, holdings: allHoldings.length },
  });
}
