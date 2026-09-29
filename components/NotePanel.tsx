"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const NoteEditor = dynamic(() => import("./NoteEditor"), { ssr: false });

type NoteImage = { id: number; url: string };
type Note = { id: number; date: string; content: string; starred: boolean; images: NoteImage[]; createdAt?: string };
type Tag = { id: number; name: string; color: string };

type Notebook = { id: number; symbol: string; name: string };
const CK_DEFAULT_BOOK_ID = 37; // Hans价值投资 in compound-knowledge

type Bar = { time: string; close: number };
type ActionRow = { id: number; date: string; target: string; action: string; price?: string; quantity?: string; note: string; createdAt?: string };

type Props = {
  symbol: string;
  notes: Note[];
  activeDate: string | null;
  onNotesSaved: () => void;
  onExportPdf: () => Promise<void>;
  notebooks?: Notebook[];
  centered?: boolean;
  bars?: Bar[];
  actionRows?: ActionRow[];
  onActionRowSaved?: () => void;
};

function parseContent(content: string) {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: content, body: "" };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const TAG_COLORS = ["#3b82f6","#22c55e","#ef4444","#f97316","#eab308","#8b5cf6","#ec4899","#6b7280"];

// Find the closing price on or before a given date from sorted bars
function priceOnDate(bars: Bar[], date: string): number | null {
  if (!bars.length) return null;
  // bars are sorted by time ascending; find last bar with time <= date
  let lo = 0, hi = bars.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= date) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result >= 0 ? bars[result].close : null;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (price >= 10) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export default function NotePanel({ symbol, notes, activeDate, onNotesSaved, onExportPdf, notebooks = [], centered, bars = [], actionRows, onActionRowSaved }: Props) {
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [bodies, setBodies] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const editingIds = useRef<Set<number>>(new Set());

  // Action row state
  const [actionEditing, setActionEditing] = useState<Record<number, Partial<ActionRow>>>({});
  const actionSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [actionSaving, setActionSaving] = useState<Set<number>>(new Set());
  const [actionDraft, setActionDraft] = useState<{ date: string; target: string; action: string; price: string; quantity: string; note: string } | null>(null);
  const [addingAction, setAddingAction] = useState(false);

  function getActionVal(row: ActionRow, field: keyof ActionRow): string {
    return (actionEditing[row.id]?.[field] as string | undefined) ?? (row[field] as string);
  }

  function patchActionRow(id: number, field: keyof ActionRow, value: string) {
    setActionEditing(e => ({ ...e, [id]: { ...(e[id] ?? {}), [field]: value } }));
    clearTimeout(actionSaveTimers.current[id]);
    setActionSaving(s => new Set(s).add(id));
    actionSaveTimers.current[id] = setTimeout(async () => {
      await fetch("/api/action-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      setActionSaving(s => { const n = new Set(s); n.delete(id); return n; });
      onActionRowSaved?.();
    }, 800);
  }

  async function deleteActionRow(id: number) {
    if (!confirm("删除这条行动记录？")) return;
    await fetch(`/api/action-log?id=${id}`, { method: "DELETE" });
    onActionRowSaved?.();
  }

  async function addActionRow() {
    if (!actionDraft) return;
    setAddingAction(true);
    await fetch("/api/action-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        date: actionDraft.date,
        target: actionDraft.target,
        action: actionDraft.action,
        price: actionDraft.price || "0",
        quantity: actionDraft.quantity || "0",
        note: actionDraft.note,
      }),
    });
    setActionDraft(null);
    setAddingAction(false);
    onActionRowSaved?.();
  }

  // Tags state
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [noteTags, setNoteTags] = useState<Record<number, number[]>>({});
  const [tagPopover, setTagPopover] = useState<number | null>(null);
  const [copyPopover, setCopyPopover] = useState<number | null>(null);
  const [sendingQuote, setSendingQuote] = useState<number | null>(null);
  const [quoteSuccess, setQuoteSuccess] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const copyPopoverRef = useRef<HTMLDivElement>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (Array.isArray(data)) setAllTags(data);
  }, []);

  const fetchNoteTags = useCallback(async (noteIds: number[]) => {
    if (noteIds.length === 0) return;
    const results = await Promise.all(
      noteIds.map(id => fetch(`/api/note-tags?noteId=${id}`).then(r => r.json()))
    );
    const map: Record<number, number[]> = {};
    noteIds.forEach((id, i) => {
      map[id] = Array.isArray(results[i]) ? results[i].map((r: { tagId: number }) => r.tagId) : [];
    });
    setNoteTags(map);
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { fetchNoteTags(notes.map(n => n.id)); }, [notes, fetchNoteTags]);

  // Close popovers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setTagPopover(null);
      if (copyPopoverRef.current && !copyPopoverRef.current.contains(e.target as Node)) setCopyPopover(null);
    }
    if (tagPopover !== null || copyPopover !== null) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagPopover, copyPopover]);

  async function sendToQuotes(note: Note) {
    setSendingQuote(note.id);
    const bookId = CK_DEFAULT_BOOK_ID;
    const currentContent =
      titles[note.id] !== undefined || bodies[note.id] !== undefined
        ? (titles[note.id] ?? "") + (bodies[note.id] ? "\n" + bodies[note.id] : "")
        : note.content;
    const nl = currentContent.indexOf("\n");
    const title = nl > 0 ? currentContent.slice(0, nl).trim() : currentContent.trim();
    const body = nl >= 0 ? currentContent.slice(nl + 1) : "";
    try {
      const res = await fetch(`/api/ck-proxy?path=/api/books/${bookId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "quote", title: title || null, content: body }),
      });
      if (!res.ok) { alert("发送失败：" + res.status); return; }
      setQuoteSuccess(true);
      setTimeout(() => setQuoteSuccess(false), 3000);
    } catch (e) {
      alert("发送失败，请检查网络");
      console.error(e);
    } finally {
      setSendingQuote(null);
    }
  }

  async function copyNoteToNotebook(note: Note, targetSymbol: string) {
    setCopying(note.id);
    const currentContent =
      titles[note.id] !== undefined || bodies[note.id] !== undefined
        ? (titles[note.id] ?? "") + (bodies[note.id] ? "\n" + bodies[note.id] : "")
        : note.content;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: targetSymbol, date: note.date, content: currentContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("复制失败：" + (err.error ?? res.status));
      } else {
        const newNote = await res.json();
        // Copy tags to new note
        const tagIds = noteTags[note.id] ?? [];
        if (tagIds.length > 0 && newNote?.id) {
          await Promise.all(tagIds.map(tagId =>
            fetch("/api/note-tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ noteId: newNote.id, tagId }),
            })
          ));
        }
        setCopySuccess(targetSymbol);
        setTimeout(() => setCopySuccess(null), 3000);
      }
    } catch (e) {
      alert("复制失败，请检查网络");
      console.error(e);
    } finally {
      setCopying(null);
      setCopyPopover(null);
    }
  }

  useEffect(() => {
    setTitles(prev => {
      const next = { ...prev };
      for (const n of notes) if (!editingIds.current.has(n.id)) next[n.id] = parseContent(n.content).title;
      return next;
    });
    setBodies(prev => {
      const next = { ...prev };
      for (const n of notes) if (!editingIds.current.has(n.id)) next[n.id] = parseContent(n.content).body;
      return next;
    });
    setExpanded(prev => {
      const alreadySet = Object.keys(prev).length > 0;
      if (alreadySet) return prev;
      const sorted = [...notes].sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.id - a.id;
      });
      const next: Record<number, boolean> = {};
      sorted.slice(0, 3).forEach(n => { next[n.id] = true; });
      return next;
    });
  }, [notes]);

  useEffect(() => {
    if (!activeDate) return;
    const ym = activeDate.slice(0, 7);
    const closest = [...notes].reverse().find(n => n.date <= activeDate && n.date.slice(0, 7) >= ym) ?? notes[notes.length - 1];
    if (closest) noteRefs.current[String(closest.id)]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeDate, notes]);

  const schedSave = useCallback((id: number, title: string, body: string) => {
    editingIds.current.add(id);
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      setSaving(s => ({ ...s, [id]: true }));
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, id, content: title + (body ? "\n" + body : "") }),
      });
      setSaving(s => ({ ...s, [id]: false }));
      editingIds.current.delete(id);
      onNotesSaved();
    }, 1500);
  }, [symbol, onNotesSaved]);

  function handleTitle(id: number, val: string) {
    setTitles(t => ({ ...t, [id]: val }));
    schedSave(id, val, bodies[id] ?? "");
  }

  function handleBody(id: number, html: string) {
    setBodies(b => ({ ...b, [id]: html }));
    schedSave(id, titles[id] ?? "", html);
  }

  async function imageToDataUrl(file: File): Promise<string> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function toggleStar(id: number, current: boolean) {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, id, starred: !current }),
    });
    onNotesSaved();
  }

  async function deleteNote(id: number) {
    if (!confirm("确定删除这条笔记？")) return;
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    onNotesSaved();
  }

  async function addNewNote() {
    setAdding(true);
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, date: today, content: "" }),
    });
    const newNote = await res.json();
    setAdding(false);
    onNotesSaved();
    setTimeout(() => {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (newNote?.id) setExpanded(e => ({ ...e, [newNote.id]: true }));
    }, 150);
  }

  function expandAll() {
    const all: Record<number, boolean> = {};
    notes.forEach(n => { all[n.id] = true; });
    setExpanded(all);
  }

  function collapseAll() { setExpanded({}); }

  function isHighlighted(note: Note) {
    if (!activeDate) return false;
    return note.date.slice(0, 7) === activeDate.slice(0, 7);
  }

  async function toggleNoteTag(noteId: number, tagId: number) {
    const current = noteTags[noteId] ?? [];
    if (current.includes(tagId)) {
      await fetch(`/api/note-tags?noteId=${noteId}&tagId=${tagId}`, { method: "DELETE" });
      setNoteTags(prev => ({ ...prev, [noteId]: (prev[noteId] ?? []).filter(t => t !== tagId) }));
    } else {
      await fetch("/api/note-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, tagId }),
      });
      setNoteTags(prev => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), tagId] }));
    }
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    const tag = await res.json();
    if (tag?.id) {
      setAllTags(prev => [...prev, tag]);
      setNewTagName("");
    }
  }

  async function deleteTag(tagId: number) {
    await fetch(`/api/tags?id=${tagId}`, { method: "DELETE" });
    setAllTags(prev => prev.filter(t => t.id !== tagId));
    setNoteTags(prev => {
      const next = { ...prev };
      for (const key in next) next[key] = next[key].filter(id => id !== tagId);
      return next;
    });
  }

  const today = new Date().toISOString().split("T")[0];

  // The action table card sorts by the earliest row's createdAt date
  const actionTableDate = actionRows && actionRows.length > 0
    ? ([...actionRows].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0].createdAt ?? today).split("T")[0]
    : today;

  type Item =
    | { kind: "note"; data: Note; sortDate: string; sortCa: string }
    | { kind: "actionTable"; sortDate: string; sortCa: string };

  const allItems: Item[] = [
    ...notes.map(n => ({ kind: "note" as const, data: n, sortDate: n.date, sortCa: n.createdAt ?? "" })),
    ...(actionRows !== undefined ? [{ kind: "actionTable" as const, sortDate: actionTableDate, sortCa: actionTableDate }] : []),
  ];
  allItems.sort((a, b) => {
    // Action table is always pinned to top
    if (a.kind === "actionTable") return -1;
    if (b.kind === "actionTable") return 1;
    const aStarred = a.kind === "note" && a.data.starred;
    const bStarred = b.kind === "note" && b.data.starred;
    if (aStarred !== bStarred) return aStarred ? -1 : 1;
    if (a.sortDate !== b.sortDate) return b.sortDate.localeCompare(a.sortDate);
    return b.sortCa.localeCompare(a.sortCa);
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className={`${centered ? "max-w-6xl mx-auto px-8" : "px-4"} py-2 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">研究笔记 <span className="text-gray-300">({notes.length})</span></span>
            <button onClick={collapseAll} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded transition-colors">全部收起</button>
            <button onClick={expandAll} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded transition-colors">全部展开</button>
          </div>
          <div className="flex items-center gap-2">
            {copySuccess && (
              <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded">✓ 已复制到笔记本</span>
            )}
            {quoteSuccess && (
              <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded">✓ 已发送到原则</span>
            )}
            <button
              onClick={async () => { setExporting(true); try { await onExportPdf(); } finally { setExporting(false); } }}
              disabled={exporting}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1.5 rounded transition-colors disabled:opacity-40">
              {exporting ? "生成中..." : "导出 PDF"}
            </button>
{actionRows !== undefined && (
              <button
                onClick={() => { const d = new Date().toISOString().split("T")[0]; setActionDraft({ date: d, target: "", action: "买入", price: "", quantity: "", note: "" }); listRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={actionDraft !== null}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors">
                + 添加行动
              </button>
            )}
            <button onClick={addNewNote} disabled={adding}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors">
              {adding ? "创建中..." : "+ 添加笔记"}
            </button>
          </div>
        </div>

      </div>

      {/* Notes */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-4">
        <div className={`${centered ? "max-w-6xl mx-auto px-8" : "px-4"} space-y-4`}>
          {allItems.length === 0 && !actionDraft && (
            <p className="text-gray-400 text-sm text-center mt-10">还没有笔记，点击「添加笔记」开始记录</p>
          )}

          {allItems.map((item) => {
            // ── Action table card ──
            if (item.kind === "actionTable") {
              const rows = [...(actionRows ?? [])].sort((a, b) => b.date.localeCompare(a.date));
              const cellCls = "px-3 py-1.5";
              const inputCls = "w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none text-sm text-gray-700 transition-colors";
              return (
                <div key="action-table" className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{actionTableDate}</span>
                      <span className="text-xs font-semibold text-gray-600">📋 行动记录</span>
                      <span className="text-xs text-gray-300">({rows.length} 条)</span>
                    </div>
                    <button
                      onClick={() => { const d = new Date().toISOString().split("T")[0]; setActionDraft({ date: d, target: "", action: "买入", price: "", quantity: "", note: "" }); }}
                      disabled={actionDraft !== null}
                      className="text-xs text-green-600 hover:text-green-800 border border-green-200 hover:border-green-400 px-2.5 py-1 rounded transition-colors disabled:opacity-40">
                      + 添加行
                    </button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {["日期","标的","操作","价格","数量","备注",""].map((h, i) => (
                            <th key={i} className={`text-left px-3 py-1.5 text-xs font-semibold text-gray-400 whitespace-nowrap ${i === 5 ? "w-full" : ""}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Draft row */}
                        {actionDraft && (
                          <tr className="border-b border-green-50 bg-green-50/30">
                            <td className={cellCls}>
                              <input type="date" value={actionDraft.date}
                                onChange={e => setActionDraft(d => d ? { ...d, date: e.target.value } : d)}
                                className="text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none" />
                            </td>
                            <td className={cellCls}>
                              <input type="text" value={actionDraft.target} placeholder="AAPL"
                                onChange={e => setActionDraft(d => d ? { ...d, target: e.target.value } : d)}
                                className={inputCls} autoFocus />
                            </td>
                            <td className={cellCls}>
                              <button
                                onClick={() => setActionDraft(d => d ? { ...d, action: d.action === "买入" ? "卖出" : "买入" } : d)}
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${actionDraft.action === "买入" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                {actionDraft.action}
                              </button>
                            </td>
                            <td className={cellCls}>
                              <input type="number" value={actionDraft.price} placeholder="0"
                                onChange={e => setActionDraft(d => d ? { ...d, price: e.target.value } : d)}
                                className={`${inputCls} w-20`} />
                            </td>
                            <td className={cellCls}>
                              <input type="number" value={actionDraft.quantity} placeholder="0"
                                onChange={e => setActionDraft(d => d ? { ...d, quantity: e.target.value } : d)}
                                className={`${inputCls} w-20`} />
                            </td>
                            <td className={cellCls}>
                              <input type="text" value={actionDraft.note} placeholder="备注..."
                                onChange={e => setActionDraft(d => d ? { ...d, note: e.target.value } : d)}
                                onKeyDown={e => { if (e.key === "Enter") addActionRow(); }}
                                className={inputCls} />
                            </td>
                            <td className={`${cellCls} whitespace-nowrap`}>
                              <button onClick={addActionRow} disabled={addingAction}
                                className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-2 py-0.5 rounded mr-1">
                                {addingAction ? "…" : "保存"}
                              </button>
                              <button onClick={() => setActionDraft(null)}
                                className="text-xs text-gray-400 hover:text-gray-600">取消</button>
                            </td>
                          </tr>
                        )}

                        {rows.map(row => (
                          <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 group">
                            <td className={cellCls}>
                              <input type="date" value={getActionVal(row, "date")}
                                onChange={e => patchActionRow(row.id, "date", e.target.value)}
                                className="text-xs text-gray-400 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none" />
                            </td>
                            <td className={cellCls}>
                              <input type="text" value={getActionVal(row, "target")} placeholder="标的"
                                onChange={e => patchActionRow(row.id, "target", e.target.value)}
                                className={inputCls} />
                            </td>
                            <td className={cellCls}>
                              <button
                                onClick={() => patchActionRow(row.id, "action", getActionVal(row, "action") === "买入" ? "卖出" : "买入")}
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${getActionVal(row, "action") === "买入" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                {getActionVal(row, "action")}
                              </button>
                            </td>
                            <td className={cellCls}>
                              <input type="number" value={getActionVal(row, "price") ?? ""} placeholder="0"
                                onChange={e => patchActionRow(row.id, "price", e.target.value)}
                                className={`${inputCls} w-20`} />
                            </td>
                            <td className={cellCls}>
                              <input type="number" value={getActionVal(row, "quantity") ?? ""} placeholder="0"
                                onChange={e => patchActionRow(row.id, "quantity", e.target.value)}
                                className={`${inputCls} w-20`} />
                            </td>
                            <td className={cellCls}>
                              <input type="text" value={getActionVal(row, "note")} placeholder="备注..."
                                onChange={e => patchActionRow(row.id, "note", e.target.value)}
                                className={inputCls} />
                              {actionSaving.has(row.id) && <span className="text-xs text-gray-300 ml-1">保存中</span>}
                            </td>
                            <td className={cellCls}>
                              <button onClick={() => deleteActionRow(row.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-sm">✕</button>
                            </td>
                          </tr>
                        ))}

                        {rows.length === 0 && !actionDraft && (
                          <tr><td colSpan={7} className="text-center text-xs text-gray-300 py-4">暂无记录，点击「+ 添加行」开始</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            // ── Text note card ──
            const note = item.data;
            const isOpen = !!expanded[note.id];
            const hl = isHighlighted(note);
            const bodyText = stripHtml(bodies[note.id] ?? note.content);
            const noteTagIds = noteTags[note.id] ?? [];
            const noteTagObjs = allTags.filter(t => noteTagIds.includes(t.id));

            return (
              <div key={note.id}
                ref={(el) => { noteRefs.current[String(note.id)] = el; }}
                className={`rounded-xl border bg-white transition-all duration-300 overflow-hidden ${
                  hl ? "border-blue-400 shadow-md shadow-blue-100 ring-1 ring-blue-300" : "border-gray-200 shadow-sm"
                }`}
              >
                {/* Header row */}
                <div className={`flex items-center justify-between px-5 py-1.5 border-b ${hl ? "border-blue-100 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleStar(note.id, note.starred)}
                      className={`text-base leading-none transition-colors ${note.starred ? "text-yellow-400" : "text-gray-300 hover:text-yellow-400"}`}>★</button>
                    <input type="date" defaultValue={note.date}
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, id: note.id, date: e.target.value }) });
                        onNotesSaved();
                      }}
                      className={`text-xs border-none bg-transparent focus:outline-none cursor-pointer ${hl ? "text-blue-500" : "text-gray-400"}`}
                    />
                    {(() => {
                      const notePrice = priceOnDate(bars, note.date);
                      const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
                      if (notePrice === null) return null;
                      const pct = currentPrice !== null ? (currentPrice - notePrice) / notePrice * 100 : null;
                      const sign = pct !== null && pct >= 0 ? "+" : "";
                      const pctColor = pct === null ? "" : pct > 0 ? "text-green-600" : pct < 0 ? "text-red-500" : "text-gray-400";
                      return (
                        <span className="flex items-center gap-1">
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            <span className="text-gray-400 mr-0.5">then:</span>{formatPrice(notePrice)}
                          </span>
                          {pct !== null && (
                            <span className={`text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded ${pctColor}`}>
                              <span className="text-gray-400 mr-0.5">now:</span>{sign}{pct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5 relative">
                    {saving[note.id] && <span className="text-xs text-gray-400">保存中...</span>}

                    {/* Copy to notebook button */}
                    {notebooks.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => { setCopyPopover(copyPopover === note.id ? null : note.id); setTagPopover(null); }}
                          className="text-gray-400 hover:text-purple-500 border border-gray-200 hover:border-purple-300 px-1.5 py-0.5 rounded transition-colors"
                          title="复制到笔记本">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                        </button>
                        {copyPopover === note.id && (
                          <div ref={copyPopoverRef}
                            className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-44">
                            <div className="text-xs font-medium text-gray-500 mb-1.5 px-1">复制到笔记本</div>
                            {notebooks.filter(nb => nb.symbol !== symbol).map(nb => (
                              <button key={nb.id}
                                onClick={() => copyNoteToNotebook(note, nb.symbol)}
                                disabled={copying === note.id}
                                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 hover:text-purple-700 transition-colors disabled:opacity-40 truncate">
                                {copying === note.id ? "复制中..." : nb.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Send to 原则 button */}
                    <button
                      onClick={() => sendToQuotes(note)}
                      disabled={sendingQuote === note.id}
                      className="text-gray-400 hover:text-purple-500 border border-gray-200 hover:border-purple-300 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40"
                      title="发送到「原则」">
                      {sendingQuote === note.id ? "…" : "✨"}
                    </button>

                    {/* Tag button */}
                    <div className="relative">
                      <button
                        onClick={() => setTagPopover(tagPopover === note.id ? null : note.id)}
                        className="text-gray-400 hover:text-blue-500 border border-gray-200 hover:border-blue-300 px-1.5 py-0.5 rounded transition-colors"
                        title="添加标签">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                          <line x1="7" y1="7" x2="7.01" y2="7"/>
                        </svg>
                      </button>

                      {/* Tag popover */}
                      {tagPopover === note.id && (
                        <div ref={popoverRef}
                          className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-56">
                          <div className="text-xs font-medium text-gray-500 mb-2">添加标签</div>

                          {/* Existing tags */}
                          {allTags.length > 0 && (
                            <div className="space-y-1 mb-3">
                              {allTags.map(tag => {
                                const active = noteTagIds.includes(tag.id);
                                return (
                                  <div key={tag.id} className="flex items-center justify-between group">
                                    <button
                                      onClick={() => toggleNoteTag(note.id, tag.id)}
                                      className="flex items-center gap-1.5 flex-1 text-left text-sm px-1.5 py-1 rounded hover:bg-gray-50 transition-colors">
                                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                                      <span className={active ? "font-medium text-gray-900" : "text-gray-600"}>{tag.name}</span>
                                      {active && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                                    </button>
                                    <button
                                      onClick={() => deleteTag(tag.id)}
                                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 px-1 transition-all text-xs">×</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* New tag */}
                          <div className="border-t border-gray-100 pt-2.5">
                            <div className="text-xs text-gray-400 mb-1.5">新建标签</div>
                            <input
                              type="text"
                              value={newTagName}
                              onChange={e => setNewTagName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") createTag(); }}
                              placeholder="标签名称"
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 mb-2"
                            />
                            <div className="flex items-center gap-1 mb-2">
                              {TAG_COLORS.map(c => (
                                <button key={c} onClick={() => setNewTagColor(c)}
                                  className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                                  style={{ background: c }} />
                              ))}
                            </div>
                            <button
                              onClick={createTag}
                              disabled={!newTagName.trim()}
                              className="w-full text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-1 rounded transition-colors">
                              创建
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button onClick={() => deleteNote(note.id)}
                      className="text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-1.5 py-0.5 rounded transition-colors"
                      title="删除笔记">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Title + tags inline */}
                <div className="flex items-center flex-wrap gap-2 px-5 pt-2.5 pb-1 border-b border-gray-100">
                  <div className="relative min-w-[6rem]">
                    <span className="invisible whitespace-pre text-lg font-bold px-0 block min-w-[6rem]">
                      {titles[note.id] || "标题"}
                    </span>
                    <input type="text"
                      value={titles[note.id] ?? ""}
                      onChange={(e) => handleTitle(note.id, e.target.value)}
                      placeholder="标题"
                      className="absolute inset-0 w-full text-lg font-bold text-gray-800 placeholder-gray-300 focus:outline-none bg-white"
                    />
                  </div>
                  {noteTagObjs.map(tag => (
                    <span key={tag.id}
                      className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full text-white flex-shrink-0"
                      style={{ background: tag.color }}>
                      {tag.name}
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); toggleNoteTag(note.id, tag.id); }}
                        className="ml-0.5 opacity-70 hover:opacity-100 leading-none">×</button>
                    </span>
                  ))}
                </div>

                {/* Body */}
                {isOpen ? (
                  <NoteEditor
                    content={bodies[note.id] ?? ""}
                    onChange={(html) => handleBody(note.id, html)}
                    onImageFile={imageToDataUrl}
                  />
                ) : (
                  <div
                    className="px-5 py-2 text-base text-gray-500 leading-relaxed line-clamp-4 cursor-pointer"
                    onClick={() => setExpanded(e => ({ ...e, [note.id]: true }))}
                  >
                    {bodyText || <span className="text-gray-300 italic">点击展开编辑...</span>}
                  </div>
                )}

                {/* Footer */}
                <div className="flex justify-end px-5 py-1.5 border-t border-gray-50">
                  <button onClick={() => setExpanded(e => ({ ...e, [note.id]: !e[note.id] }))}
                    className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                    {isOpen ? "收起 ▲" : "展开 ▼"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
