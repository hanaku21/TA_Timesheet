"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// Zoomable image that stays inside the modal: ＋/− buttons, mouse wheel, double-click,
// drag-to-pan when zoomed. Resets when the slide changes.
function ZoomImage({ src, alt, t }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const MIN = 1, MAX = 4;
  const zoomTo = (next) => {
    const z = Math.min(MAX, Math.max(MIN, Math.round(next * 100) / 100));
    setScale(z);
    if (z === 1) setPos({ x: 0, y: 0 });
  };
  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }); }, [src]);

  const onWheel = (e) => { e.preventDefault(); zoomTo(scale + (e.deltaY < 0 ? 0.25 : -0.25)); };
  const onPointerDown = (e) => {
    if (scale === 1) return;
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => { if (drag.current) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="relative bg-slate-100">
      <div
        className="flex h-[60vh] items-center justify-center overflow-hidden select-none"
        style={{ cursor: scale > 1 ? "grab" : "zoom-in", touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => zoomTo(scale > 1 ? 1 : 2)}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform duration-75"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        />
      </div>
      {/* zoom toolbar (inside the modal) */}
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow ring-1 ring-slate-200">
        <button type="button" className="rounded-md px-2 py-0.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => zoomTo(scale - 0.25)} aria-label="zoom out">−</button>
        <span className="w-12 text-center text-xs tabular-nums text-slate-600">{Math.round(scale * 100)}%</span>
        <button type="button" className="rounded-md px-2 py-0.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => zoomTo(scale + 0.25)} aria-label="zoom in">＋</button>
        {scale !== 1 && (
          <button type="button" className="rounded-md px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100" onClick={() => zoomTo(1)}>{t("พอดี", "Fit")}</button>
        )}
      </div>
      {scale > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white">
          {t("ลากเพื่อเลื่อนดู · ดับเบิลคลิกเพื่อย่อกลับ", "Drag to pan · double-click to reset")}
        </div>
      )}
    </div>
  );
}

// Slideshow modal shown ONCE per login: the login page sets a sessionStorage flag,
// the first dashboard view consumes it. Fetches /api/announcements; renders nothing
// when there are no active items (or the flag isn't set, e.g. a page refresh).
export default function AnnouncementModal({ locale = "th" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const t = (th, en) => (locale === "en" ? en : th);

  // Re-open on demand (the "ประกาศ" button on the overview dispatches this event).
  // Always refetches so newly added announcements show up without a reload.
  useEffect(() => {
    const onOpen = async () => {
      try {
        const r = await fetch("/api/announcements");
        const d = r.ok ? await r.json() : { items: [] };
        const list = d.items || [];
        setItems(list);
        setI(0);
        if (list.length > 0) setOpen(true);
        else alert(t("ยังไม่มีประกาศในขณะนี้", "No announcements right now"));
      } catch { /* ignore */ }
    };
    window.addEventListener("ta:open-announcements", onOpen);
    return () => window.removeEventListener("ta:open-announcements", onOpen);
  }, []); // eslint-disable-line

  useEffect(() => {
    // Only the first dashboard view after login shows the modal (flag set by the login page).
    // NOTE: the flag is consumed AFTER the fetch resolves — React StrictMode (dev) runs this
    // effect twice, and consuming it synchronously made the second run see no flag.
    let pending = false;
    try { pending = sessionStorage.getItem("ta_announce_pending") === "1"; } catch { pending = false; }
    if (!pending) return;

    let alive = true;
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (!alive) return;
        try { sessionStorage.removeItem("ta_announce_pending"); } catch { /* ignore */ }
        const list = d.items || [];
        setItems(list);
        setOpen(list.length > 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const n = items.length;
  const next = useCallback(() => setI((x) => (x + 1) % Math.max(1, n)), [n]);
  const prev = useCallback(() => setI((x) => (x - 1 + n) % Math.max(1, n)), [n]);

  // keyboard + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, next, prev]);

  // auto-advance every 7s when more than one slide
  useEffect(() => {
    if (!open || n < 2) return;
    const id = setInterval(next, 7000);
    return () => clearInterval(id);
  }, [open, n, next]);

  if (!open || n === 0) return null;
  const it = items[i] || items[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-700">
            📢 {t("ประกาศ", "Announcement")}{n > 1 ? ` · ${i + 1}/${n}` : ""}
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="close">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {it.kind === "image" ? (
            <div>
              <ZoomImage src={it.image_data} alt={it.title || "announcement"} t={t} />
              {it.title && <div className="px-5 py-3 text-center text-base font-semibold text-slate-700">{it.title}</div>}
            </div>
          ) : (
            <div className="px-6 py-6">
              {it.title && <h3 className="mb-2 text-xl font-bold text-slate-800">{it.title}</h3>}
              {it.body && <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">{it.body}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            {n > 1 && (
              <>
                <button className="btn-ghost px-3" onClick={prev} aria-label="previous">←</button>
                <div className="flex items-center gap-1.5">
                  {items.map((_, k) => (
                    <button key={k} onClick={() => setI(k)} aria-label={`slide ${k + 1}`}
                      className={`h-2 rounded-full transition-all ${k === i ? "w-5 bg-brand" : "w-2 bg-slate-300 hover:bg-slate-400"}`} />
                  ))}
                </div>
                <button className="btn-ghost px-3" onClick={next} aria-label="next">→</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {it.link_url && (
              <a className="btn-ghost text-sm" href={it.link_url} target="_blank" rel="noreferrer">{t("เปิดลิงก์", "Open link")} ↗</a>
            )}
            <button className="btn-primary" onClick={() => setOpen(false)}>{t("รับทราบ", "Got it")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
