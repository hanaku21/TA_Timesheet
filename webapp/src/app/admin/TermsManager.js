"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

const EMPTY = { id: null, code: "", name: "", start_date: "", end_date: "", activate: true };

export default function TermsManager() {
  const [terms, setTerms] = useState([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [form, setForm] = useState(null); // null = modal closed
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/terms");
    const d = await res.json();
    setTerms(d.terms || []);
    setActiveUsers(d.active_users || 0);
  }

  // every TA account -> inactive (admins untouched)
  async function deactivateAll() {
    if (!confirm(`ปิดใช้งานผู้ช่วยสอนทั้งหมด (${activeUsers} คนที่ยัง active)?\n\nทุกคนจะเข้าระบบไม่ได้ จนกว่าจะนำเข้าไฟล์ผู้ช่วยสอนของภาคใหม่ หรือกด “เปิดใช้งานผู้ใช้ของภาคนี้” ข้อมูลเดิมยังอยู่ครบ`)) return;
    const res = await fetch("/api/admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate_all" }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || "ไม่สำเร็จ"); return; }
    alert(`ปิดใช้งานแล้ว ${d.count} คน`);
    load();
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
    const t = terms.find((x) => x.id === id);
    if (!confirm(
      `สลับไปใช้ภาคการศึกษา ${t?.code || ""}?\n\n` +
      "• ผู้ช่วยสอนทุกคนจะถูกตั้งเป็น inactive (เข้าระบบไม่ได้) จนกว่าจะนำเข้าไฟล์ผู้ช่วยสอนของภาคใหม่\n" +
      "• วิชา/section และวันหยุด จะว่างจนกว่าจะนำเข้า/เพิ่มของภาคใหม่\n" +
      "• ข้อมูลของภาคเดิมยังอยู่ครบ ดูย้อนหลังได้จากตัวกรองภาคการศึกษา"
    )) return;
    await fetch("/api/admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "activate" }),
    });
    load();
  }

  async function usersAction(t, action, only = false) {
    const msgs = {
      activate_users: only
        ? `เปิดใช้งานเฉพาะผู้ช่วยสอนของภาค ${t.code} (${t.people} คน) และปิดคนอื่นทั้งหมด?`
        : `เปิดใช้งานผู้ช่วยสอนของภาค ${t.code} (${t.people} คน) ให้เข้าระบบได้?`,
      deactivate_users: `ปิดใช้งานผู้ช่วยสอนของภาค ${t.code} (${t.people} คน)?`,
    };
    if (!confirm(msgs[action])) return;
    const res = await fetch("/api/admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, action, only }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || "ไม่สำเร็จ"); return; }
    load();
  }

  async function remove(t) {
    if (!confirm(`ลบภาคการศึกษา ${t.code}?`)) return;
    let res = await fetch(`/api/admin/terms?id=${t.id}`, { method: "DELETE" });
    let d = await res.json();
    if (res.status === 409 && d.needsForce) {
      if (!confirm(d.error + "\n\nต้องการลบพร้อมข้อมูลทั้งหมดของภาคนี้หรือไม่?")) return;
      res = await fetch(`/api/admin/terms?id=${t.id}&force=1`, { method: "DELETE" });
      d = await res.json();
    }
    if (!res.ok) { alert(d.error || "ลบไม่สำเร็จ"); return; }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">ภาคการศึกษา</h3>
        <button className="btn-primary" onClick={openCreate}>+ สร้างภาคการศึกษาใหม่</button>
      </div>
      <p className="text-sm text-slate-500">
        สร้างภาคการศึกษาใหม่ (เริ่มจากว่าง) จากนั้นไปที่แท็บ “นำเข้า/ลบ/สำรองข้อมูล” เพื่อนำเข้าข้อมูลของภาคนั้น
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
        <span>ผู้ช่วยสอนที่เข้าระบบได้ตอนนี้ (active): <b className={activeUsers ? "text-emerald-600" : "text-slate-400"}>{activeUsers}</b> คน</span>
        <button className="btn-ghost px-2 py-1 text-xs text-red-600" disabled={!activeUsers} onClick={deactivateAll}>
          ปิดใช้งานผู้ช่วยสอนทั้งหมด
        </button>
      </div>

      <div className="card">
        {terms.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีภาคการศึกษา</p>}
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
                  {t.people > 0 && <> · ผู้ช่วยสอน {t.people} คน (<span className={t.active_people === t.people ? "text-emerald-600" : t.active_people === 0 ? "text-red-500" : "text-amber-600"}>active {t.active_people}</span>)</>}
                </div>
                {t.people > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => usersAction(t, "activate_users", false)}
                      title="ตั้งผู้ช่วยสอนที่มีการมอบหมายในภาคนี้ให้ active (คนอื่นคงเดิม)">
                      เปิดใช้งานผู้ใช้ของภาคนี้
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => usersAction(t, "activate_users", true)}
                      title="เปิดเฉพาะคนของภาคนี้ และปิดผู้ช่วยสอนคนอื่นทั้งหมด">
                      เปิดเฉพาะภาคนี้ (ปิดคนอื่น)
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => usersAction(t, "deactivate_users")}>
                      ปิดใช้งานผู้ใช้ของภาคนี้
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {!t.is_active && (
                  <button className="btn-success" onClick={() => activate(t.id)}>ใช้ภาคนี้</button>
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

      <Modal open={!!form} onClose={() => setForm(null)} title={editing ? `แก้ไขภาคการศึกษา ${form?.code}` : "สร้างภาคการศึกษาใหม่"}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="label">รหัสภาคการศึกษา *</label>
              <input className="input" value={form.code} onChange={set("code")}
                placeholder="เช่น 2569/2 หรือ 2570/1" required disabled={editing} />
              {editing && <p className="mt-1 text-xs text-slate-400">แก้ไขรหัสไม่ได้ (เป็นตัวเชื่อมข้อมูลของทั้งภาค)</p>}
            </div>
            <div>
              <label className="label">ชื่อเต็ม</label>
              <input className="input" value={form.name} onChange={set("name")} placeholder="ภาคการศึกษาที่ 2 ปีการศึกษา 2569" />
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
                ตั้งเป็นภาคที่ใช้งานทันที
                <span className="text-xs text-slate-400">(ผู้ช่วยสอนทุกคนจะ inactive จนกว่าจะนำเข้าไฟล์ของภาคใหม่)</span>
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
