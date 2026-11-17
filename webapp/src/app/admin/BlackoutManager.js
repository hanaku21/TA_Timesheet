"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

const EMPTY = { start_date: "", end_date: "", reason: "", curriculum_ids: [] };

export default function BlackoutManager() {
  const [periods, setPeriods] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [form, setForm] = useState(null); // null = modal closed
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState("");      // term being viewed
  const [terms, setTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState("");
  const [orphans, setOrphans] = useState(0);
  const [moveTo, setMoveTo] = useState("");

  async function load(t = term) {
    const res = await fetch(`/api/admin/blackouts${t ? `?term=${encodeURIComponent(t)}` : ""}`);
    const d = await res.json();
    setPeriods(d.periods || []);
    setCurricula(d.curricula || []);
    setTerm(d.term || "");
    setTerms(d.terms || []);
    setActiveTerm(d.active_term || "");
    setOrphans(d.orphans || 0);
  }

  // move all holidays of `from` ("__none__" = rows without a term) to another term
  async function moveAll(from, to) {
    if (!to) { alert("กรุณาเลือกภาคการศึกษาปลายทาง"); return; }
    const label = from === "__none__" ? `${orphans} ช่วงที่ยังไม่ผูกกับภาคใด` : `ช่วงห้ามลงเวลาทั้งหมดของภาค ${from} (${periods.length} ช่วง)`;
    if (!confirm(`ย้าย ${label}\nไปอยู่ภาคการศึกษา ${to}?`)) return;
    const res = await fetch("/api/admin/blackouts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_term: from, to_term: to }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || "ย้ายไม่สำเร็จ"); return; }
    alert(`ย้ายแล้ว ${d.moved} ช่วง ไปภาคการศึกษา ${to}`);
    setMoveTo("");
    load(to);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCur(id) {
    const has = form.curriculum_ids.includes(id);
    setForm({
      ...form,
      curriculum_ids: has ? form.curriculum_ids.filter((x) => x !== id) : [...form.curriculum_ids, id],
    });
  }

  const editing = !!form?.id;

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const res = await fetch("/api/admin/blackouts", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, term }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setMsg({ type: "error", text: d.error }); return; }
    setForm(null);
    load();
  }

  async function remove(id) {
    if (!confirm("ลบช่วงนี้?")) return;
    await fetch(`/api/admin/blackouts?id=${id}`, { method: "DELETE" });
    load();
  }

  const curName = (id) => curricula.find((c) => c.id === id)?.code || id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex flex-wrap items-center gap-2 font-bold text-slate-700">
          ช่วงวันที่ห้ามลงเวลา (วันหยุด)
          <select className="input py-1 text-sm font-normal" value={term} onChange={(e) => load(e.target.value)}>
            {terms.map((t) => (
              <option key={t.code} value={t.code}>{t.code}{t.is_active ? " (ใช้งานอยู่)" : ""}</option>
            ))}
          </select>
          {term && activeTerm && term !== activeTerm && <span className="badge bg-amber-100 text-amber-700">ภาคที่ไม่ได้ใช้งาน</span>}
        </h3>
        <button className="btn-primary" onClick={() => { setMsg(null); setForm({ ...EMPTY }); }}>+ เพิ่มช่วงห้ามลงเวลา</button>
      </div>
      <p className="text-sm text-slate-500">เลือกเป็นช่วง หรือวันเดียว (ตั้งวันเริ่ม=วันสิ้นสุด) และเลือกได้ว่ามีผลกับหลักสูตรใด (ไม่เลือก=ทุกหลักสูตร) · วันหยุดผูกกับภาคการศึกษาที่ใช้งานอยู่ — เมื่อขึ้นภาคการศึกษาใหม่ต้องเพิ่มใหม่</p>

      {orphans > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          <span>มี {orphans} ช่วงที่ยังไม่ผูกกับภาคการศึกษาใด (จึงไม่แสดงในภาคไหนเลย)</span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => moveAll("__none__", term)}>ย้ายมาไว้ภาค {term}</button>
        </div>
      )}

      {periods.length > 0 && terms.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>ย้ายช่วงทั้งหมดของภาค {term} ({periods.length} ช่วง) ไปภาค</span>
          <select className="input w-auto py-1" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">— เลือกภาค —</option>
            {terms.filter((t) => t.code !== term).map((t) => (
              <option key={t.code} value={t.code}>{t.code}{t.is_active ? " (ใช้งานอยู่)" : ""}</option>
            ))}
          </select>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={!moveTo} onClick={() => moveAll(term, moveTo)}>ย้าย</button>
        </div>
      )}

      <div className="card">
        {periods.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีช่วงห้ามลงเวลาของภาคการศึกษา {term || "นี้"}</p>}
        <div className="overflow-hidden rounded-lg ring-1 ring-slate-100">
          {periods.map((p, i) => (
            <div key={p.id} className={`flex items-start justify-between px-3 py-2 ${i % 2 ? "bg-slate-50" : "bg-white"}`}>
              <div>
                <div className="text-sm font-medium text-slate-700">{p.start_date} → {p.end_date}</div>
                {p.reason && <div className="text-xs text-slate-500">{p.reason}</div>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.curriculum_ids.length === 0 ? (
                    <span className="badge bg-amber-100 text-amber-700">ทุกหลักสูตร</span>
                  ) : (
                    p.curriculum_ids.map((id) => (
                      <span key={id} className="badge bg-brand-light text-brand">{curName(id)}</span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button className="btn-edit" onClick={() => { setMsg(null); setForm({ id: p.id, start_date: p.start_date, end_date: p.end_date, reason: p.reason || "", curriculum_ids: [...(p.curriculum_ids || [])] }); }}>แก้ไข</button>
                <button className="btn-danger" onClick={() => remove(p.id)}>ลบ</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={editing ? "แก้ไขช่วงวันที่ห้ามลงเวลา" : "เพิ่มช่วงวันที่ห้ามลงเวลา"}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">วันเริ่มต้น</label>
                <input type="date" className="input" value={form.start_date ?? ""}
                  onChange={(e) => {
                    const start = e.target.value;
                    // default วันสิ้นสุด = วันเริ่มต้น (ถ้ายังว่าง หรือมาก่อนวันเริ่ม)
                    setForm((f) => ({
                      ...f,
                      start_date: start,
                      end_date: !f.end_date || f.end_date < start ? start : f.end_date,
                    }));
                  }} required />
              </div>
              <div>
                <label className="label">วันสิ้นสุด</label>
                <input type="date" className="input" value={form.end_date ?? ""} min={form.start_date || undefined}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">เหตุผล</label>
              <input className="input" value={form.reason ?? ""}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="เช่น ปิดภาคเรียน, วันหยุดราชการ" />
            </div>
            <div>
              <label className="label">ใช้กับหลักสูตร</label>
              <p className="mb-2 text-xs text-slate-400">ไม่เลือกเลย = มีผลกับทุกหลักสูตร</p>
              <div className="flex flex-wrap gap-2">
                {curricula.map((c) => {
                  const on = form.curriculum_ids.includes(c.id);
                  return (
                    <button type="button" key={c.id} onClick={() => toggleCur(c.id)}
                      className={`badge cursor-pointer ${on ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
            {msg && (
              <div className={`rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {msg.text}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
              <button className="btn-primary" disabled={loading}>{loading ? "กำลังบันทึก..." : editing ? "บันทึก" : "เพิ่ม"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
