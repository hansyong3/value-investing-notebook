"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

type Stock = { id: number; symbol: string; name: string };

export default function HomePage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function fetchStocks() {
    const res = await fetch("/api/stocks");
    setStocks(await res.json());
  }

  useEffect(() => { fetchStocks(); }, []);

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol || !name) return;
    setAdding(true);
    await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, name }),
    });
    setSymbol("");
    setName("");
    setAdding(false);
    fetchStocks();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">价值投资笔记</h1>
          <p className="text-gray-500 text-sm">观察清单</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          退出登录
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-8 py-10">
        <form onSubmit={addStock} className="flex gap-3 mb-10">
          <input
            type="text"
            placeholder="股票代码（如 AAPL）"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 w-44"
          />
          <input
            type="text"
            placeholder="公司名称（如 苹果）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 flex-1"
          />
          <button
            type="submit"
            disabled={adding || !symbol || !name}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            添加
          </button>
        </form>

        {stocks.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <p className="text-4xl mb-4">📋</p>
            <p>还没有股票，添加第一个开始研究</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stocks.map((stock) => (
              <Link
                key={stock.id}
                href={`/stocks/${stock.symbol}`}
                className="flex items-center justify-between p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl transition-all group"
              >
                <div>
                  <span className="font-mono font-semibold text-blue-400">{stock.symbol}</span>
                  <span className="text-gray-400 ml-3 text-sm">{stock.name}</span>
                </div>
                <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
