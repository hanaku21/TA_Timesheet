"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

const EMPTY = { id: null, code: "", name: "", start_date: "", end_date: "", activate: true };

export default function TermsManager() {
  const [terms, setTerms] = useState([]);
  const [form, setForm] = useState(null); // null = modal closed
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/terms");
    const d = await res.json();
    setTerms(d.terms || []);
  }
  useEffect(() => { load(); }, []);

  const editing = !!form?.id;
  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function openCreate() { setMsg(null); setForm({ ...EMPTY }); }
  function openEdit(t) {
    setMsg(null);
    setForm({ id: t.id, code: t.code, name: t.name || "", start_date: t.start_date || "", end_date: t.end_date || "" });
  }

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/terms", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setForm(null);
      load();
    } catch (e2) {
      setMsg({ type: "error", text: e2.message });
    } finally {
      setLoading(false);
    }
  }

  async function activate(id) {
    await fetch("/api/admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "activate" }),
    });
    load();
  }

  async function remove(t) {
    if (!confirm(`ลบปีการศึกษา ${t.code}?`)) return;
    let res = await fetch(`/api/admin/terms?id=${t.id}`, { method: "DELETE" });
    let d = await res.json();
    if (res.status === 409 && d.needsForce) {
      if (!confirm(d.error + "\n\nต้องการลบพร้อมข้อมูลทั้งหมดของปีนี้หรือไม่?")) return;
      res = await fetch(`/api/admin/terms?id=${t.id}&force=1`, { method: "DELETE" });
      d = await res.json();
    }
    if (!res.ok) { alert(d.error || "ลบไม่สำเร็จ"); return; }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">ปีการศึกษา</h3>
        <button className="btn-primary" onClick={openCreate}>+ สร้างปีการศึกษาใหม่</button>
      </div>
      <p className="text-sm text-slate-500">
        สร้างปีใหม่ (เริ่มจากว่าง) จากนั้นไปที่แท็บ “นำเข้า/ลบ/สำรองข้อมูล” เพื่อนำเข้าข้อมูลของปีนั้น
      </p>

      <div className="card">
        {terms.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีปีการศึกษา</p>}
        <ul className="space-y-2">
          {terms.map((t) => (
            <li key={t.id} className="flex items-start justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">{t.code}</span>
                  {t.is_active && <span className="badge bg-emerald-100 text-emerald-700">ใช้งานอยู่</span>}
                </div>
                {t.name && <div className="text-xs text-slate-500">{t.name}</div>}
                <div className="text-xs text-slate-400">
                  {t.start_date || "—"} ถึง {t.end_date || "—"} · {t.sections} section · {t.entries} รายการ
                </div>
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {!t.is_active && (
                  <button className="btn-success" onClick={() => activate(t.id)}>ใช้ปีนี้</button>
                )}
                <button className="btn-edit" onClick={() => openEdit(t)}>แก้ไข</button>
                {!t.is_active && (
                  <button className="btn-danger" onClick={() => remove(t)}>ลบ</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={editing ? `แก้ไขปีการศึกษา ${form?.code}` : "สร้างปีการศึกษาใหม่"}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="label">รหัสปีการศึกษา *</label>
              <input className="input" value={form.code} onChange={set("code")}
                placeholder="เช่น 2569/2 หรือ 2570/1" required disabled={editing} />
              {editing && <p className="mt-1 text-xs text-slate-400">แก้ไขรหัสไม่ได้ (เป็นตัวเชื่อมข้อมูลของทั้งปี)</p>}
            </div>
            <div>
              <label className="label">ชื่อเต็ม</label>
              <input className="input" value={form.name} onChange={set("name")} placeholder="ปีการศึกษา 2569 ภาคการศึกษาที่ 2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">วันเปิดเทอม</label>
                <input type="date" className="input" value={form.start_date || ""} onChange={set("start_date")} />
              </div>
              <div>
                <label className="label">วันปิดเทอม</label>
                <input type="date" className="input" value={form.end_date || ""} onChange={set("end_date")} />
              </div>
            </div>
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.activate} onChange={set("activate")} />
                ตั้งเป็นปีที่ใช้งานทันที
              </label>
            )}
            {msg?.type === "error" && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg.text}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
              <button className="btn-primary" disabled={loading}>{loading ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
