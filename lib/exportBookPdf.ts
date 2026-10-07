type BookNote = { id: number; date: string; content: string; starred: boolean };

// Landscape A4 sheet holding two portrait half-pages, like an open book.
const MM = 96 / 25.4;
const SHEET_W = 297;
const SHEET_H = 210;
const HALF_W = SHEET_W / 2;
const M_TOP = 18;
const M_BOTTOM = 20;
const M_OUTER = 15;
const M_INNER = 18; // gutter side gets more room for binding/folding
const CONTENT_W = HALF_W - M_OUTER - M_INNER;
const CONTENT_H = SHEET_H - M_TOP - M_BOTTOM;
const PAGE_W_PX = Math.round(CONTENT_W * MM);
const PAGE_H_PX = Math.round(CONTENT_H * MM);
const FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const PS_COLOR = "#92400e";

type Block = { el: HTMLElement; keepWithNext?: boolean; noteHeader?: boolean; splittable?: boolean };

function textOf(html: string) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").trim();
}

function para(text: string, extra = ""): HTMLElement {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText = `margin:0 0 6px;white-space:pre-wrap;${extra}`;
  return p;
}

function buildBlocks(notes: BookNote[], symbol: string, name: string): Block[] {
  const blocks: Block[] = [];

  const cover = document.createElement("div");
  cover.style.cssText = "padding-bottom:14px;margin-bottom:18px;border-bottom:1.5px solid #111;";
  cover.innerHTML = `
    <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;margin-bottom:6px;">价值投资笔记</div>
    <div style="font-size:22px;font-weight:800;line-height:1.25;color:#111;"></div>
    <div style="font-size:9px;color:#9ca3af;margin-top:8px;">导出日期：${new Date().toLocaleDateString("zh-CN")} · 共 ${notes.length} 篇</div>`;
  (cover.children[1] as HTMLElement).textContent = name || symbol;
  blocks.push({ el: cover });

  for (const note of notes) {
    const raw = note.content ?? "";
    const nl = raw.indexOf("\n");
    const title = nl > 0 ? textOf(raw.slice(0, nl)) : "";
    // Legacy plain-text postscripts → paragraphs so they parse like the rest.
    const bodyHtml = (nl >= 0 ? raw.slice(nl + 1) : raw)
      .replace(/\n?-{3,}\n(附言[（(][^）)]*[）)])\n?/g, "<p>---</p><p>$1</p>");

    const header = document.createElement("div");
    header.style.cssText = "margin-bottom:6px;";
    const meta = document.createElement("div");
    meta.style.cssText = "font-size:9px;color:#9ca3af;font-family:monospace;margin-bottom:2px;";
    meta.textContent = `${note.starred ? "★ " : ""}${note.date}`;
    header.appendChild(meta);
    if (title) {
      const t = document.createElement("div");
      t.style.cssText = "font-size:14px;font-weight:700;color:#111;line-height:1.45;";
      t.textContent = title;
      header.appendChild(t);
    }
    blocks.push({ el: header, keepWithNext: true, noteHeader: true });

    const tpl = document.createElement("div");
    tpl.innerHTML = bodyHtml;
    const nodes = Array.from(tpl.childNodes);
    let inPs = false;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const txt = (n.textContent ?? "").trim();
      const hasImg = n instanceof HTMLElement && !!n.querySelector?.("img") || (n as HTMLElement).tagName === "IMG";
      if (!txt && !hasImg) continue;

      const nextTxt = (nodes.slice(i + 1).find(x => (x.textContent ?? "").trim())?.textContent ?? "").trim();
      if (/^-{3,}$/.test(txt) && /^附言[（(]/.test(nextTxt)) {
        inPs = true;
        const sep = document.createElement("div");
        sep.style.cssText = `margin:12px 0 4px;padding-top:8px;border-top:1px dashed #fcd34d;font-size:9px;font-weight:600;color:#d97706;`;
        const m = nextTxt.match(/^附言[（(]\s*(.+?)\s*[）)]\s*([\s\S]*)$/);
        sep.textContent = `附言  ${m?.[1] ?? ""}`;
        blocks.push({ el: sep, keepWithNext: true });
        const restTxt = m?.[2]?.trim();
        // skip the 附言（date） node itself
        i = nodes.indexOf(nodes.slice(i + 1).find(x => (x.textContent ?? "").trim())!);
        if (restTxt) blocks.push({ el: para(restTxt, `color:${PS_COLOR};`), splittable: true });
        continue;
      }

      let el: HTMLElement;
      if (n.nodeType === Node.TEXT_NODE) {
        el = para(txt);
      } else {
        el = (n as HTMLElement).cloneNode(true) as HTMLElement;
        if (el.tagName === "P") el.style.margin = "0 0 6px";
        if (/^H[1-6]$/.test(el.tagName)) el.style.cssText += "font-size:13px;font-weight:700;margin:8px 0 4px;";
        if (el.tagName === "UL" || el.tagName === "OL") el.style.cssText += "margin:0 0 6px;padding-left:18px;";
        el.querySelectorAll("img").forEach(img => {
          img.style.maxWidth = "100%";
          img.style.maxHeight = `${PAGE_H_PX - 40}px`;
          img.crossOrigin = "anonymous";
        });
        if (el.tagName === "IMG") {
          el.style.maxWidth = "100%";
          el.style.maxHeight = `${PAGE_H_PX - 40}px`;
          el.style.display = "block";
        }
      }
      if (inPs) el.style.color = PS_COLOR;
      blocks.push({ el, splittable: !hasImg && !!txt });
    }
  }
  return blocks;
}

// Largest prefix of a text block that still fits on the page; rest carries over.
function trySplit(b: Block, page: HTMLElement): [Block, Block] | null {
  if (!b.splittable) return null;
  const text = b.el.textContent ?? "";
  if (text.length < 2) return null;
  const make = (s: string) => {
    const c = b.el.cloneNode(false) as HTMLElement;
    c.style.whiteSpace = "pre-wrap";
    c.textContent = s;
    return c;
  };
  let lo = 0, hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = make(text.slice(0, mid));
    page.appendChild(c);
    const ok = page.scrollHeight <= PAGE_H_PX;
    page.removeChild(c);
    if (ok) lo = mid; else hi = mid - 1;
  }
  if (lo < 20) return null;
  // Prefer breaking at a space for latin text
  const sp = text.lastIndexOf(" ", lo);
  const cut = sp > lo - 15 && sp > 0 ? sp + 1 : lo;
  const head = make(text.slice(0, cut));
  head.style.marginBottom = "0";
  return [{ el: head }, { el: make(text.slice(cut).trimStart()), splittable: true }];
}

function paginate(blocks: Block[], host: HTMLElement): HTMLElement[] {
  const pages: HTMLElement[] = [];
  const newPage = () => {
    const d = document.createElement("div");
    d.style.cssText = `width:${PAGE_W_PX}px;height:${PAGE_H_PX}px;overflow:hidden;background:#fff;font-family:${FONT};color:#1f2937;font-size:11.5px;line-height:1.75;box-sizing:border-box;`;
    host.appendChild(d);
    pages.push(d);
    return d;
  };
  let page = newPage();
  const queue = [...blocks];
  while (queue.length) {
    const b = queue.shift()!;
    const isTop = page.childElementCount === 0;
    if (b.noteHeader) b.el.style.marginTop = isTop ? "0" : "20px";
    page.appendChild(b.el);
    let fits = page.scrollHeight <= PAGE_H_PX;

    if (fits && b.keepWithNext && !isTop && queue.length) {
      const next = queue[0];
      page.appendChild(next.el);
      // Keep a heading with at least the start of what follows it
      const nextFits = page.scrollHeight <= PAGE_H_PX;
      page.removeChild(next.el);
      if (!nextFits && !trySplit(next, page)) fits = false;
    }
    if (fits) continue;

    page.removeChild(b.el);
    const parts = trySplit(b, page);
    if (parts) {
      page.appendChild(parts[0].el);
      queue.unshift(parts[1]);
    } else if (isTop) {
      page.appendChild(b.el); // can't be split (e.g. image) — place it anyway
    } else {
      queue.unshift(b);
    }
    page = newPage();
  }
  if (page.childElementCount === 0) {
    host.removeChild(page);
    pages.pop();
  }
  return pages;
}

export async function exportBookPdf(symbol: string, name: string) {
  const res = await fetch(`/api/notes?symbol=${encodeURIComponent(symbol)}`);
  const notes: BookNote[] = await res.json();
  if (!Array.isArray(notes) || !notes.length) { alert("没有笔记可导出"); return; }

  // A book reads oldest → newest
  const sorted = [...notes].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;";
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    const pages = paginate(buildBlocks(sorted, symbol, name), host);

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    for (let i = 0; i < pages.length; i++) {
      const side = i % 2;
      if (i > 0 && side === 0) pdf.addPage();
      const canvas = await html2canvas(pages[i], { scale: 2.5, useCORS: true, logging: false, backgroundColor: "#ffffff" });
      const x = side === 0 ? M_OUTER : HALF_W + M_INNER;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", x, M_TOP, CONTENT_W, CONTENT_H);
      pdf.setFontSize(8);
      pdf.setTextColor(160);
      pdf.text(String(i + 1), side === 0 ? x : x + CONTENT_W, SHEET_H - 11, { align: side === 0 ? "left" : "right" });
    }

    pdf.save(`${name || symbol}-书本版.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
