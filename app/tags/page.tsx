"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Tag = { id: number; name: string; color: string };
type NoteImage = { id: number; url: string };
type TagNote = {
  id: number; date: string; content: string; starred: boolean;
  stockId: number; stockSymbol: string; stockName: string; notebook: boolean;
  images: NoteImage[];
};

function parseContent(content: string) {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: content, body: "" };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [notes, setNotes] = useState<TagNote[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/tags").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTags(data);
    });
  }, []);

  // Load note counts for all tags
  useEffect(() => {
    if (tags.length === 0) return;
    Promise.all(
      tags.map(tag =>
        fetch(`/api/notes?tagId=${tag.id}`)
          .then(r => r.json())
          .then(data => ({ tagId: tag.id, count: Array.isArray(data) ? data.length : 0 }))
      )
    ).then(results => {
      const map: Record<number, number> = {};
      results.forEach(r => { map[r.tagId] = r.count; });
      setNoteCounts(map);
    });
  }, [tags]);

  const loadNotes = useCallback(async (tag: Tag) => {
    setLoading(true);
    setExpanded({});
    const res = await fetch(`/api/notes?tagId=${tag.id}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setNotes(data.sort((a: TagNote, b: TagNote) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.date.localeCompare(a.date);
      }));
    }
    setLoading(false);
  }, []);

  function selectTag(tag: Tag) {
    setSelectedTag(tag);
    loadNotes(tag);
  }

  // Group notes by stock
  const grouped: { symbol: string; name: string; notebook: boolean; notes: TagNote[] }[] = [];
  for (const note of notes) {
    const existing = grouped.find(g => g.symbol === note.stockSymbol);
    if (existing) {
      existing.notes.push(note);
    } else {
      grouped.push({ symbol: note.stockSymbol, name: note.stockName, notebook: note.notebook, notes: [note] });
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left: tag list */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3 transition-colors">
            ← 返回笔记本
          </Link>
          <h1 className="text-sm font-semibold text-gray-700">标签视图</h1>
          <p className="text-xs text-gray-400 mt-0.5">跨笔记本汇总</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {tags.length === 0 && (
            <p className="text-xs text-gray-400 px-4 mt-4 text-center">还没有标签<br/>在笔记里创建后在此查看</p>
          )}
          {tags.map(tag => (
            <button key={tag.id}
              onClick={() => selectTag(tag)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left ${
                selectedTag?.id === tag.id ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />
              <span className="flex-1 truncate">{tag.name}</span>
              {noteCounts[tag.id] !== undefined && (
                <span className="text-xs text-gray-400">{noteCounts[tag.id]}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Right: notes */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {!selectedTag && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <p className="text-sm">选择左侧标签查看笔记</p>
          </div>
        )}

        {selectedTag && (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
              <span className="w-3 h-3 rounded-full" style={{ background: selectedTag.color }} />
              <h2 className="text-lg font-semibold text-gray-800">{selectedTag.name}</h2>
              <span className="text-sm text-gray-400">{notes.length} 条笔记</span>
            </div>

            {loading && (
              <div className="text-center text-gray-400 text-sm py-12">加载中...</div>
            )}

            {!loading && notes.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-12">该标签下暂无笔记</div>
            )}

            {/* Notes grouped by stock */}
            {!loading && grouped.map(group => (
              <div key={group.symbol} className="mb-8">
                {/* Stock header */}
                <Link href={`/stocks/${group.symbol}`}
                  className="inline-flex items-center gap-1.5 mb-3 group">
                  <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                    group.notebook ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}>{group.symbol}</span>
                  <span className="text-sm text-gray-500 group-hover:text-gray-800 transition-colors">{group.name}</span>
                  <span className="text-xs text-gray-300 group-hover:text-blue-400 transition-colors">→</span>
                </Link>

                <div className="space-y-3">
                  {group.notes.map(note => {
                    const { title, body } = parseContent(note.content);
                    const preview = stripHtml(body);
                    const isOpen = !!expanded[note.id];

                    return (
                      <div key={note.id}
                        className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        {/* Note header */}
                        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-1.5">
                            {note.starred && <span className="text-yellow-400 text-sm">★</span>}
                            <span className="text-xs text-gray-400 font-mono">{note.date}</span>
                          </div>
                          <button
                            onClick={() => setExpanded(e => ({ ...e, [note.id]: !e[note.id] }))}
                            className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                            {isOpen ? "收起 ▲" : "展开 ▼"}
                          </button>
                        </div>

                        {/* Title */}
                        {title && (
                          <div className="px-4 pt-3 pb-1 text-base font-bold text-gray-800">{title}</div>
                        )}

                        {/* Body */}
                        {isOpen ? (
                          <div
                            className="px-4 py-2 text-sm text-gray-600 leading-relaxed tiptap"
                            dangerouslySetInnerHTML={{ __html: body }}
                          />
                        ) : (
                          preview && (
                            <div
                              className="px-4 py-2 text-sm text-gray-500 leading-relaxed line-clamp-3 cursor-pointer"
                              onClick={() => setExpanded(e => ({ ...e, [note.id]: true }))}>
                              {preview}
                            </div>
                          )
                        )}

                        {/* Images (expanded only) */}
                        {isOpen && note.images.length > 0 && (
                          <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                            {note.images.map(img => (
                              <img key={img.id} src={img.url} alt="" className="w-full rounded" />
                            ))}
                          </div>
                        )}

                        {!title && !preview && (
                          <div className="px-4 py-2 text-sm text-gray-300 italic">（空笔记）</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
