"use client";
import { useState } from "react";

type Holding = {
  id: number;
  type: string;
  date: string;
  shares: string;
  price: string;
  currency: string;
  fee: string;
  note: string;
};

type Props = {
  symbol: string;
  holdings: Holding[];
  onSaved: () => void;
};

export default function HoldingsPanel({ symbol, holdings, onSaved }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "buy", date: "", shares: "", price: "", currency: "USD", fee: "", note: "" });
  const [saving, setSaving] = useState(false);

  // Summary stats
  let totalShares = 0;
  let totalCost = 0;
  for (const h of holdings) {
    const s = parseFloat(h.shares);
    const p = parseFloat(h.price);
    const f = parseFloat(h.fee || "0");
    if (h.type === "buy") { totalShares += s; totalCost += s * p + f; }
    if (h.type === "sell") { totalShares -= s; totalCost -= s * (totalCost / (totalShares + s) || p); }
  }
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, ...form }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ type: "buy", date: "", shares: "", price: "", currency: "USD", fee: "", note: "" });
    onSaved();
  }

  async function deleteHolding(id: number) {
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">持仓记录</span>
          {totalShares > 0 && (
            <>
              <span className="text-xs text-gray-500">持仓 <span className="font-mono text-gray-800">{totalShares.toLocaleString()}</span> 股</span>
              <span className="text-xs text-gray-500">均价 <span className="font-mono text-gray-800">{avgCost.toFixed(3)}</span></span>
            </>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
        >
          + 添加记录
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-gray-200 bg-blue-50 flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">类型</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white">
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">股数</label>
            <input type="number" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
              placeholder="100" required className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 w-24 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">价格</label>
            <input type="number" step="0.0001" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="150.00" required className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 w-24 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">货币</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white">
              <option value="USD">USD</option>
              <option value="HKD">HKD</option>
              <option value="CNY">CNY</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">手续费</label>
            <input type="number" step="0.01" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))}
              placeholder="0" className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 w-20 bg-white" />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="可选" className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 w-full bg-white" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded transition-colors">
              {saving ? "保存..." : "保存"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-gray-500 hover:text-gray-700 text-xs px-3 py-1.5 rounded transition-colors">
              取消
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {holdings.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无持仓记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                {["类型", "日期", "股数", "价格", "货币", "手续费", "金额", "备注", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const amount = parseFloat(h.shares) * parseFloat(h.price);
                return (
                  <tr key={h.id} className="border-t border-gray-100 hover:bg-white">
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
                      <button onClick={() => deleteHolding(h.id)} className="text-gray-300 hover:text-red-400 transition-colors text-xs">✕</button>
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
