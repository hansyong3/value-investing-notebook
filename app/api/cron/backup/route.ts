import { NextResponse } from "next/server";
import { db } from "@/db";
import { stocks, notes, noteImages, holdings } from "@/db/schema";

const FILE_PATH = "backup.json";

export async function GET(req: Request) {
  const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({
      error: "Missing GitHub env vars",
      debug: {
        hasToken: !!GITHUB_TOKEN,
        tokenLength: GITHUB_TOKEN?.length ?? 0,
        hasRepo: !!GITHUB_REPO,
        repo: GITHUB_REPO ?? "NOT SET",
      }
    }, { status: 500 });
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
  const body: Record<string, unknown> = {
    message: `Auto backup ${new Date().toISOString().split("T")[0]}`,
    content,
  };
  if (sha) body.sha = sha;
  // Only specify branch if repo already has commits
  if (sha) body.branch = "main";

  const res = await fetch(apiBase, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errJson: unknown;
    try { errJson = JSON.parse(errText); } catch { errJson = errText; }
    return NextResponse.json({ error: "GitHub push failed", detail: errJson }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    backedUpAt: backup.exportedAt,
    counts: { stocks: allStocks.length, notes: allNotes.length, holdings: allHoldings.length },
  });
}
