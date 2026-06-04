import { NextResponse } from "next/server";
import { db } from "@/db";
import { stocks, notes, noteImages, holdings } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET: export all data as JSON
export async function GET() {
  const allStocks = await db.select().from(stocks);
  const allNotes = await db.select().from(notes);
  const allImages = await db.select().from(noteImages);
  const allHoldings = await db.select().from(holdings);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stocks: allStocks,
    notes: allNotes,
    noteImages: allImages,
    holdings: allHoldings,
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="investing-backup-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}

// POST: restore from JSON backup
// mode: "merge" (default) or "replace"
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "merge";

  let backup: {
    version: number;
    stocks: typeof stocks.$inferSelect[];
    notes: typeof notes.$inferSelect[];
    noteImages: typeof noteImages.$inferSelect[];
    holdings: typeof holdings.$inferSelect[];
  };

  try {
    backup = await req.json();
    if (!backup.stocks || !backup.notes) throw new Error("Invalid backup format");
  } catch {
    return NextResponse.json({ error: "Invalid backup file" }, { status: 400 });
  }

  if (mode === "replace") {
    // Full replace: delete all and re-insert
    await db.delete(noteImages);
    await db.delete(holdings);
    await db.delete(notes);
    await db.delete(stocks);

    if (backup.stocks.length > 0) await db.insert(stocks).values(backup.stocks);
    if (backup.notes.length > 0) await db.insert(notes).values(backup.notes);
    if (backup.noteImages.length > 0) await db.insert(noteImages).values(backup.noteImages);
    if (backup.holdings.length > 0) await db.insert(holdings).values(backup.holdings);

    return NextResponse.json({ ok: true, mode: "replace", restored: { stocks: backup.stocks.length, notes: backup.notes.length } });
  }

  // Merge mode: get existing IDs, only insert missing ones
  const existingStocks = await db.select({ id: stocks.id }).from(stocks);
  const existingNotes = await db.select({ id: notes.id }).from(notes);
  const existingImages = await db.select({ id: noteImages.id }).from(noteImages);
  const existingHoldings = await db.select({ id: holdings.id }).from(holdings);

  const existingStockIds = new Set(existingStocks.map(s => s.id));
  const existingNoteIds = new Set(existingNotes.map(n => n.id));
  const existingImageIds = new Set(existingImages.map(i => i.id));
  const existingHoldingIds = new Set(existingHoldings.map(h => h.id));

  const newStocks = backup.stocks.filter(s => !existingStockIds.has(s.id));
  const newNotes = backup.notes.filter(n => !existingNoteIds.has(n.id));
  const newImages = backup.noteImages?.filter(i => !existingImageIds.has(i.id)) ?? [];
  const newHoldings = backup.holdings?.filter(h => !existingHoldingIds.has(h.id)) ?? [];

  if (newStocks.length > 0) await db.insert(stocks).values(newStocks);
  if (newNotes.length > 0) await db.insert(notes).values(newNotes);
  if (newImages.length > 0) await db.insert(noteImages).values(newImages);
  if (newHoldings.length > 0) await db.insert(holdings).values(newHoldings);

  return NextResponse.json({
    ok: true,
    mode: "merge",
    restored: {
      stocks: newStocks.length,
      notes: newNotes.length,
      images: newImages.length,
      holdings: newHoldings.length,
    },
    skipped: {
      stocks: backup.stocks.length - newStocks.length,
      notes: backup.notes.length - newNotes.length,
    },
  });
}
