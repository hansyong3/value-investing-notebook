"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      // Ensure NOTES stock exists, then redirect to first stock
      await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: "NOTES", name: "通用笔记" }),
      });
      const res = await fetch("/api/stocks");
      const stocks = await res.json();
      if (Array.isArray(stocks) && stocks.length > 0) {
        router.replace(`/stocks/${stocks[0].symbol}`);
      }
    }
    redirect();
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-white text-gray-400 text-sm">
      加载中...
    </div>
  );
}
