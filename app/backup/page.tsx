"use client";
import { useState, useRef } from "react";
import Link from "next/link";

export default function BackupPage() {
  const [importing, setImporting] = useState(false);
  const [githubBacking, setGithubBacking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleGithubBackup() {
    setGithubBacking(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/cron/backup");
      const data = await res.json();
      if (data.ok) {
        setResult(`已备份到 GitHub：${data.counts.stocks} 个标的、${data.counts.notes} 条笔记、${data.counts.holdings} 条持仓记录`);
      } else {
        setError(data.error || "备份失败");
      }
    } catch {
      setError("备份失败，请检查 GitHub 配置");
    } finally {
      setGithubBacking(false);
    }
  }

  async function handleExport() {
    const res = await fetch("/api/backup");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investing-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(mode: "merge" | "replace") {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("请先选择备份文件"); return; }

    if (mode === "replace" && !confirm("⚠️ 完全替换会删除所有现有数据再恢复备份，确定继续吗？")) return;

    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch(`/api/backup?mode=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (data.ok) {
        if (mode === "merge") {
          setResult(`合并完成：新增 ${data.restored.stocks} 个标的、${data.restored.notes} 条笔记、${data.restored.holdings} 条持仓记录；跳过已有 ${data.skipped.notes} 条笔记`);
        } else {
          setResult(`完全替换完成：恢复 ${data.restored.stocks} 个标的、${data.restored.notes} 条笔记`);
        }
      } else {
        setError(data.error || "恢复失败");
      }
    } catch {
      setError("文件格式错误，请选择正确的备份 JSON 文件");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="flex items-center gap-4 mb-10">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">← 返回</Link>
          <h1 className="text-2xl font-bold">数据备份与恢复</h1>
        </div>

        {/* GitHub Auto Backup */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">🔄 自动备份到 GitHub</h2>
          <p className="text-sm text-gray-500 mb-1">每周一自动备份到 <code className="bg-gray-100 px-1 rounded text-xs">hansyong3/investing-data-backup</code>，有完整版本历史。</p>
          <p className="text-sm text-gray-400 mb-4">也可以点下方按钮立即手动备份一次。</p>
          <button onClick={handleGithubBackup} disabled={githubBacking}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
            {githubBacking ? "备份中..." : "立即备份到 GitHub"}
          </button>
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">📤 下载到本地</h2>
          <p className="text-sm text-gray-500 mb-4">将所有数据导出为 JSON 文件，保存到本地电脑或云盘。</p>
          <button onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
            下载备份文件
          </button>
        </div>

        {/* Import */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">📥 恢复备份</h2>
          <p className="text-sm text-gray-500 mb-4">选择之前导出的 JSON 备份文件，选择恢复模式：</p>

          <div className="space-y-3 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="font-medium text-blue-800 mb-1">✅ 合并恢复（推荐）</div>
              <div className="text-sm text-blue-600">只补回备份中有、但线上没有的数据。线上已有的数据完全保留，不会被覆盖。适合大多数情况。</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <div className="font-medium text-red-800 mb-1">⚠️ 完全替换（危险）</div>
              <div className="text-sm text-red-600">删除所有现有数据，完全用备份文件替换。只在数据严重错误时使用。</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5 font-medium">选择备份文件</label>
              <input ref={fileRef} type="file" accept=".json"
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleImport("merge")} disabled={importing}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
                {importing ? "恢复中..." : "合并恢复"}
              </button>
              <button onClick={() => handleImport("replace")} disabled={importing}
                className="bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
                完全替换
              </button>
            </div>
          </div>

          {result && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              ✅ {result}
            </div>
          )}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              ❌ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
