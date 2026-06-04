"use client";
import { useState } from "react";

type Holding = {
  id: number; type: string; date: string; shares: string;
  price: string; currency: string; fee: string; note: string;
};

type Props = { symbol: string; holdings: Holding[]; onSaved: () => void; currentPrice?: number | null; };

type EditForm = { type: string; date: string; shares: string; price: string; currency: string; fee: string; note: string };

const EMPTY: EditForm = { type: "buy", date: "", shares: "", price: "", currency: "USD", fee: "", note: "" };

function FormRow({ form, onChange, onSave, onCancel, saving }: {
  form: EditForm;
  onChange: (f: EditForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [k]: e.target.value });

  return (
    <tr className="bg-blue-50">
      <td className="px-3 py-2">
        <select value={form.type} onChange={set("type")} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select>
      </td>
      <td className="px-3 py-2"><input type="date" value={form.date} onChange={set("date")} required className="border border-gray-300 rounded px-2 py-1 text-sm w-32 bg-white" /></td>
      <td className="px-3 py-2"><input type="number" value={form.shares} onChange={set("shares")} placeholder="股数" required className="border border-gray-300 rounded px-2 py-1 text-sm w-24 bg-white" /></td>
      <td className="px-3 py-2"><input type="number" step="0.0001" value={form.price} onChange={set("price")} placeholder="价格" required className="border border-gray-300 rounded px-2 py-1 text-sm w-24 bg-white" /></td>
      <td className="px-3 py-2">
        <select value={form.currency} onChange={set("currency")} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          <option value="USD">USD</option>
          <option value="HKD">HKD</option>
          <option value="CNY">CNY</option>
        </select>
      </td>
      <td className="px-3 py-2"><input type="number" step="0.01" value={form.fee} onChange={set("fee")} placeholder="0" className="border border-gray-300 rounded px-2 py-1 text-sm w-20 bg-white" /></td>
      <td className="px-3 py-2 font-mono text-sm text-gray-500">
        {form.shares && form.price ? (parseFloat(form.shares) * parseFloat(form.price)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
      </td>
      <td className="px-3 py-2"><input type="text" value={form.note} onChange={set("note")} placeholder="备注" className="border border-gray-300 rounded px-2 py-1 text-sm w-28 bg-white" /></td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={onSave} disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded disabled:opacity-40">
            {saving ? "…" : "保存"}
          </button>
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">取消</button>
        </div>
      </td>
    </tr>
  );
}

export default function HoldingsPanel({ symbol, holdings, onSaved, currentPrice }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [newForm, setNewForm] = useState<EditForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);

  // Summary: FIFO average cost calculation
  let totalShares = 0, totalCost = 0;
  for (const h of [...holdings].sort((a, b) => a.date.localeCompare(b.date))) {
    const s = parseFloat(h.shares), p = parseFloat(h.price), f = parseFloat(h.fee || "0");
    if (h.type === "buy") {
      totalCost += s * p + f;
      totalShares += s;
    } else {
      const avgPerShare = totalShares > 0 ? totalCost / totalShares : p;
      totalCost -= s * avgPerShare;
      totalShares -= s;
    }
  }
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
  const pnl = currentPrice != null && totalShares > 0 ? (currentPrice - avgCost) * totalShares : null;
  const pnlRate = currentPrice != null && avgCost > 0 ? (currentPrice - avgCost) / avgCost * 100 : null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, ...newForm }),
    });
    setSaving(false);
    setShowForm(false);
    setNewForm(EMPTY);
    onSaved();
  }

  async function handleEdit() {
    if (!editingId) return;
    setEditSaving(true);
    await fetch("/api/holdings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm }),
    });
    setEditSaving(false);
    setEditingId(null);
    onSaved();
  }

  async function deleteHolding(id: number) {
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    onSaved();
  }

  function startEdit(h: Holding) {
    setEditingId(h.id);
    setEditForm({ type: h.type, date: h.date, shares: h.shares, price: h.price, currency: h.currency, fee: h.fee || "", note: h.note || "" });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-t border-gray-200">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">持仓记录</span>
          {totalShares > 0 && (
            <>
              <span className="text-xs text-gray-500">持仓 <span className="font-mono text-gray-800">{totalShares.toLocaleString()}</span> 股</span>
              <span className="text-xs text-gray-500">持有平均成本 <span className="font-mono text-gray-800">{avgCost.toFixed(3)}</span></span>
              {pnl != null && (
                <span className={`text-xs font-medium ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  盈亏 <span className="font-mono">{pnl >= 0 ? "+" : ""}{pnl.toFixed(0)}</span>
                  {pnlRate != null && (
                    <span className="ml-1">({pnlRate >= 0 ? "+" : ""}{pnlRate.toFixed(2)}%)</span>
                  )}
                </span>
              )}
              {currentPrice != null && totalShares > 0 && (
                <span className="text-xs text-gray-400">当前价 <span className="font-mono text-gray-600">{currentPrice.toFixed(3)}</span></span>
              )}
            </>
          )}
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors">
          + 添加记录
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {holdings.length === 0 && !showForm ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无持仓记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                {["类型", "日期", "股数", "价格", "货币", "手续费", "金额", "备注", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showForm && (
                <FormRow
                  form={newForm}
                  onChange={setNewForm}
                  onSave={() => handleAdd({ preventDefault: () => {} } as React.FormEvent)}
                  onCancel={() => { setShowForm(false); setNewForm(EMPTY); }}
                  saving={saving}
                />
              )}
              {holdings.map((h) => {
                const amount = parseFloat(h.shares) * parseFloat(h.price);
                if (editingId === h.id) {
                  return (
                    <FormRow
                      key={h.id}
                      form={editForm}
                      onChange={setEditForm}
                      onSave={handleEdit}
                      onCancel={() => setEditingId(null)}
                      saving={editSaving}
                    />
                  );
                }
                return (
                  <tr key={h.id} className="border-t border-gray-100 hover:bg-white group">
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${h.type === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {h.type === "buy" ? "买入" : "卖出"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">{h.date}</td>
                    <td className="px-3 py-2 text-gray-800 font-mono">{parseFloat(h.shares).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-800 font-mono">{parseFloat(h.price).toFixed(3)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{h.currency}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono text-xs">{parseFloat(h.fee || "0").toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-800 font-mono">{amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-32 truncate">{h.note}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(h)} className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 border border-blue-200 rounded">编辑</button>
                        <button onClick={() => deleteHolding(h.id)} className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-0.5 border border-gray-200 rounded">✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
