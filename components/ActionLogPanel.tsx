"use client";
import { useEffect, useState, useRef } from "react";

type ActionRow = {
  id: number;
  date: string;
  target: string;
  action: string;
  note: string;
};

type DraftRow = {
  date: string;
  target: string;
  action: string;
  note: string;
};

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m)}月`;
}

function groupByMonth(rows: ActionRow[]): [string, ActionRow[]][] {
  const map = new Map<string, ActionRow[]>();
  for (const r of rows) {
    const ym = r.date.slice(0, 7);
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym)!.push(r);
  }
  // Sort months descending
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function ActionLogPanel({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [editing, setEditing] = useState<Record<number, Partial<ActionRow>>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // draft for new row
  const today = new Date().toISOString().split("T")[0];
  const emptyDraft = (): DraftRow => ({ date: today, target: "", action: "买入", note: "" });
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [addingRow, setAddingRow] = useState(false);

  async function fetchRows() {
    const res = await fetch(`/api/action-log?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (Array.isArray(data)) setRows(data);
  }

  useEffect(() => { fetchRows(); }, [symbol]);

  function schedSave(id: number, patch: Partial<ActionRow>) {
    clearTimeout(saveTimers.current[id]);
    setSaving(s => new Set(s).add(id));
    saveTimers.current[id] = setTimeout(async () => {
      await fetch("/api/action-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      setSaving(s => { const n = new Set(s); n.delete(id); return n; });
      fetchRows();
    }, 800);
  }

  function patchRow(id: number, field: keyof ActionRow, value: string) {
    setEditing(e => ({ ...e, [id]: { ...(e[id] ?? {}), [field]: value } }));
    schedSave(id, { [field]: value });
  }

  async function deleteRow(id: number) {
    if (!confirm("删除这条记录？")) return;
    await fetch(`/api/action-log?id=${id}`, { method: "DELETE" });
    setRows(r => r.filter(row => row.id !== id));
  }

  async function addRow() {
    if (!draft) return;
    setAddingRow(true);
    const res = await fetch("/api/action-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, ...draft }),
    });
    const row = await res.json();
    setRows(r => [...r, row].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft(null);
    setAddingRow(false);
  }

  const groups = groupByMonth(rows);
  const currentYM = today.slice(0, 7);

  function getVal(row: ActionRow, field: keyof ActionRow): string {
    return (editing[row.id]?.[field] as string | undefined) ?? row[field] as string;
  }

  const inputCls = "w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none text-sm text-gray-700 py-0.5 transition-colors";

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white flex-shrink-0 px-6 py-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">行动记录 <span className="text-gray-300">({rows.length})</span></span>
        <button
          onClick={() => setDraft(emptyDraft())}
          disabled={draft !== null}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded transition-colors"
        >
          + 添加行动
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-6 space-y-6">
        {/* Draft row (new entry) */}
        {draft && (
          <div>
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
              新记录
            </div>
            <table className="w-full border-collapse bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden text-sm">
              <thead>
                <tr className="bg-blue-50 border-b border-blue-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-32">日期</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-28">标的</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-20">操作</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">备注</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">
                    <input type="date" value={draft.date}
                      onChange={e => setDraft(d => d ? { ...d, date: e.target.value } : d)}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={draft.target} placeholder="AAPL"
                      onChange={e => setDraft(d => d ? { ...d, target: e.target.value } : d)}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDraft(d => d ? { ...d, action: d.action === "买入" ? "卖出" : "买入" } : d)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        draft.action === "买入" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                      {draft.action}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={draft.note} placeholder="备注..."
                      onChange={e => setDraft(d => d ? { ...d, note: e.target.value } : d)}
                      onKeyDown={e => { if (e.key === "Enter") addRow(); }}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2 flex items-center gap-1.5">
                    <button onClick={addRow} disabled={addingRow}
                      className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-2 py-1 rounded transition-colors">
                      {addingRow ? "…" : "保存"}
                    </button>
                    <button onClick={() => setDraft(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1 transition-colors">
                      取消
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Monthly groups */}
        {groups.length === 0 && !draft && (
          <p className="text-gray-400 text-sm text-center mt-10">还没有行动记录，点击「添加行动」开始记录</p>
        )}

        {groups.map(([ym, monthRows]) => (
          <div key={ym}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {monthLabel(ym)}
              </span>
              <span className="text-xs text-gray-300">{monthRows.length} 条</span>
              {ym === currentYM && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">本月</span>}
            </div>
            <table className="w-full border-collapse bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 w-32">日期</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 w-28">标的</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 w-20">操作</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400">备注</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {[...monthRows].sort((a, b) => b.date.localeCompare(a.date)).map(row => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 group">
                    <td className="px-3 py-1.5">
                      <input type="date" value={getVal(row, "date")}
                        onChange={e => patchRow(row.id, "date", e.target.value)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="text" value={getVal(row, "target")} placeholder="标的"
                        onChange={e => patchRow(row.id, "target", e.target.value)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => patchRow(row.id, "action", getVal(row, "action") === "买入" ? "卖出" : "买入")}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                          getVal(row, "action") === "买入" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                        {getVal(row, "action")}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="text" value={getVal(row, "note")} placeholder="备注..."
                        onChange={e => patchRow(row.id, "note", e.target.value)}
                        className={inputCls} />
                      {saving.has(row.id) && <span className="text-xs text-gray-300 ml-1">保存中</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => deleteRow(row.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-sm">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
