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

  async function load() {
    const res = await fetch("/api/admin/blackouts");
    const d = await res.json();
    setPeriods(d.periods || []);
    setCurricula(d.curricula || []);
  }
  useEffect(() => { load(); }, []);

  function toggleCur(id) {
    const has = form.curriculum_ids.includes(id);
    setForm({
      ...form,
      curriculum_ids: has ? form.curriculum_ids.filter((x) => x !== id) : [...form.curriculum_ids, id],
    });
  }

  async function create(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const res = await fetch("/api/admin/blackouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
        <h3 className="font-bold text-slate-700">ช่วงวันที่ห้ามลงเวลา (วันหยุด)</h3>
        <button className="btn-primary" onClick={() => { setMsg(null); setForm({ ...EMPTY }); }}>+ เพิ่มช่วงห้ามลงเวลา</button>
      </div>
      <p className="text-sm text-slate-500">เลือกเป็นช่วง หรือวันเดียว (ตั้งวันเริ่ม=วันสิ้นสุด) และเลือกได้ว่ามีผลกับหลักสูตรใด (ไม่เลือก=ทุกหลักสูตร)</p>

      <div className="card">
        {periods.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีช่วงห้ามลงเวลา</p>}
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
              <button className="btn-danger" onClick={() => remove(p.id)}>ลบ</button>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="เพิ่มช่วงวันที่ห้ามลงเวลา">
        {form && (
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">วันเริ่มต้น</label>
                <input type="date" className="input" value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
              </div>
              <div>
                <label className="label">วันสิ้นสุด</label>
                <input type="date" className="input" value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">เหตุผล</label>
              <input className="input" value={form.reason}
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
              <button className="btn-primary" disabled={loading}>{loading ? "กำลังบันทึก..." : "เพิ่ม"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
