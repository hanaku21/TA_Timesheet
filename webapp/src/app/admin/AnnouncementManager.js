"use client";

import { useEffect, useState } from "react";

// Admin: manage the announcement slideshow shown to TAs when they open the dashboard.
// Items are text (title + body) or image (stored as a resized data URL). Nothing active = no modal.

const MAX_SIDE = 1600; // px — longest side after client-side resize
const JPEG_Q = 0.85;

// Resize an image file in the browser and return a data URL (keeps PNG for transparency/gif stays as is).
async function fileToDataUrl(file) {
  const raw = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  if (file.type === "image/gif") return raw; // keep animation, no resize
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = raw;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && raw.length < 900_000) return raw;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(type, JPEG_Q);
}

export default function AnnouncementManager() {
  const [items, setItems] = useState([]);
  const [enabled, setEnabled] = useState(true); // master switch
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("text"); // text | image
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  async function load() {
    setErr("");
    const res = await fetch("/api/admin/announcements");
    const d = await res.json();
    if (!res.ok) { setErr(d.error || "โหลดไม่สำเร็จ"); setItems([]); return; }
    setItems(d.items || []);
    setEnabled(d.enabled !== false);
  }
  useEffect(() => { load(); }, []);

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    const res = await fetch("/api/admin/announcements", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) { setEnabled(!next); const d = await res.json(); setErr(d.error || "บันทึกไม่สำเร็จ"); }
  }

  async function pickFile(f) {
    setFile(f || null);
    setPreview("");
    if (!f) return;
    try { setPreview(await fileToDataUrl(f)); } catch { setErr("อ่านไฟล์รูปไม่สำเร็จ"); }
  }

  async function add(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    setBusy(true);
    try {
      const payload = mode === "image"
        ? { kind: "image", image_data: preview, title: title || null, link_url: link || null }
        : { kind: "text", title, body, link_url: link || null };
      if (mode === "image" && !preview) throw new Error("กรุณาเลือกรูปภาพ");
      const res = await fetch("/api/admin/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "เพิ่มไม่สำเร็จ");
      setTitle(""); setBody(""); setLink(""); setFile(null); setPreview("");
      setMsg("เพิ่มประกาศแล้ว");
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id, data) {
    const res = await fetch("/api/admin/announcements", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) { const d = await res.json(); setErr(d.error || "ไม่สำเร็จ"); }
    load();
  }
  async function remove(it) {
    if (!confirm(`ลบประกาศ${it.kind === "image" ? "รูปภาพ" : ` "${it.title || it.body?.slice(0, 30) || ""}"`}?`)) return;
    await fetch(`/api/admin/announcements?id=${it.id}`, { method: "DELETE" });
    load();
  }
  function startEdit(it) { setEditId(it.id); setEditTitle(it.title || ""); setEditBody(it.body || ""); }
  async function saveEdit() {
    await patch(editId, { title: editTitle, body: editBody });
    setEditId(null);
  }

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-700">ประกาศหน้าแรก (Slideshow)</h3>
          <p className="mt-1 text-sm text-slate-500">
            ข้อความหรือรูปภาพที่เพิ่มไว้จะเด้งเป็น modal สไลด์โชว์เมื่อผู้ช่วยสอนเปิดหน้าแรก —
            ถ้าไม่มีรายการที่เปิดใช้งาน จะไม่แสดง modal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${enabled && activeCount ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {!enabled ? "ปิดการแสดง" : activeCount ? `แสดงอยู่ ${activeCount} สไลด์` : "ไม่มีสไลด์ที่เปิดใช้"}
          </span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>{enabled ? "แสดง" : "ไม่แสดง"}</span>
            <button
              type="button" role="switch" aria-checked={enabled}
              title={enabled ? "กำลังแสดงประกาศให้ผู้ช่วยสอน — คลิกเพื่อปิด" : "ปิดการแสดงประกาศอยู่ — คลิกเพื่อเปิด"}
              onClick={toggleEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>
      </div>
      {!enabled && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ปิดการแสดงอยู่ — ผู้ช่วยสอนจะไม่เห็น modal ประกาศ แม้จะมีสไลด์ที่เปิดใช้งาน (รายการยังเก็บไว้ เปิดกลับมาได้ทุกเมื่อ)
        </div>
      )}

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      {msg && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* add form */}
        <form onSubmit={add} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            <button type="button" className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "text" ? "bg-brand text-white shadow-sm" : "text-slate-600"}`} onClick={() => setMode("text")}>＋ ข้อความ</button>
            <button type="button" className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "image" ? "bg-brand text-white shadow-sm" : "text-slate-600"}`} onClick={() => setMode("image")}>＋ รูปภาพ</button>
          </div>

          <div>
            <label className="label">หัวข้อ {mode === "image" && <span className="text-slate-400">(ไม่บังคับ — แสดงใต้รูป)</span>}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น กำหนดส่งเอกสารเบิกเดือนนี้" />
          </div>
          {mode === "text" ? (
            <div>
              <label className="label">ข้อความ</label>
              <textarea className="input min-h-[120px]" value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={"พิมพ์ข้อความประกาศ (ขึ้นบรรทัดใหม่ได้)\nเช่น ส่งเอกสารภายในสัปดาห์แรกของเดือนถัดไป"} />
            </div>
          ) : (
            <div>
              <label className="label">รูปภาพ (png / jpg / gif / webp)</label>
              <input type="file" accept="image/*" className="input" onChange={(e) => pickFile(e.target.files?.[0])} />
              <p className="mt-1 text-xs text-slate-400">ระบบจะย่อรูปให้ด้านยาวไม่เกิน {MAX_SIDE}px อัตโนมัติ (ยกเว้น gif)</p>
              {preview && (
                <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-slate-200">
                  <img src={preview} alt="preview" className="max-h-56 w-full object-contain bg-slate-50" />
                  <div className="px-2 py-1 text-[11px] text-slate-400">{file?.name} · ~{Math.round(preview.length * 0.75 / 1024)} KB หลังย่อ</div>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="label">ลิงก์ <span className="text-slate-400">(ไม่บังคับ — ปุ่ม "เปิดลิงก์" ในสไลด์)</span></label>
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "กำลังเพิ่ม..." : "เพิ่มเข้าสไลด์โชว์"}</button>
        </form>

        {/* list */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">สไลด์ทั้งหมด ({items.length})</div>
          {items.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีประกาศ</p>}
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className={`rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100 ${it.active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                    <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
                    <button className="btn-soft px-1.5 py-0.5" title="เลื่อนขึ้น" disabled={i === 0} onClick={() => patch(it.id, { move: "up" })}>▲</button>
                    <button className="btn-soft px-1.5 py-0.5" title="เลื่อนลง" disabled={i === items.length - 1} onClick={() => patch(it.id, { move: "down" })}>▼</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    {it.kind === "image" ? (
                      <img src={it.image_data} alt={it.title || "announcement"} className="max-h-32 rounded-md bg-white object-contain ring-1 ring-slate-200" />
                    ) : null}
                    {editId === it.id ? (
                      <div className="mt-1 space-y-1.5">
                        <input className="input py-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="หัวข้อ" />
                        {it.kind === "text" && (
                          <textarea className="input min-h-[80px] py-1" value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                        )}
                        <div className="flex gap-1.5">
                          <button className="btn-edit" onClick={saveEdit}>บันทึก</button>
                          <button className="btn-soft" onClick={() => setEditId(null)}>ยกเลิก</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {it.title && <div className="mt-1 text-sm font-semibold text-slate-700">{it.title}</div>}
                        {it.body && <div className="whitespace-pre-wrap text-sm text-slate-600">{it.body}</div>}
                        {it.link_url && <div className="truncate text-xs text-sky-600">{it.link_url}</div>}
                      </>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">
                      {it.kind === "image" ? "รูปภาพ" : "ข้อความ"} · {new Date(it.created_at).toLocaleDateString("th-TH")}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <button
                      type="button" role="switch" aria-checked={it.active}
                      title={it.active ? "แสดงอยู่ — คลิกเพื่อซ่อน" : "ซ่อนอยู่ — คลิกเพื่อแสดง"}
                      onClick={() => patch(it.id, { active: !it.active })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${it.active ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${it.active ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                    </button>
                    <button className="btn-edit" onClick={() => startEdit(it)}>แก้ไข</button>
                    <button className="btn-danger" onClick={() => remove(it)}>ลบ</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
