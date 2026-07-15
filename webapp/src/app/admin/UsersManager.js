"use client";

import { useEffect, useState, useCallback } from "react";
import { EMP_LABELS, EMP_BADGE } from "@/lib/constants";
import Modal from "@/components/Modal";

const EMPTY = {
  id: null, title: "", full_name: "", email: "", phone: "",
  employment_type: "SCHOLARSHIP", student_id: "", tor_number: "", password: "",
};

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState(""); // "" | active | inactive
  const [form, setForm] = useState(null); // null = modal closed
  const [msg, setMsg] = useState(null);
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    const d = await res.json();
    setUsers(d.users || []);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const editing = !!form?.id;
  const shown = users
    .filter((u) => (typeFilter ? u.employment_type === typeFilter : true))
    .filter((u) => (activeFilter === "active" ? u.active !== false : activeFilter === "inactive" ? u.active === false : true));

  async function toggleActive(u) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: u.active === false }),
    });
    load();
  }

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setOk(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มผู้ใช้แล้ว");
      setForm(null);
      load();
    } catch (e2) {
      setMsg({ type: "error", text: e2.message });
    } finally {
      setLoading(false);
    }
  }

  async function remove(u) {
    if (!confirm(`ลบ ${u.full_name}? (timesheet ของคนนี้จะถูกลบด้วย)`)) return;
    const res = await fetch(`/api/admin/users?id=${u.id}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) { alert(d.error); return; }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-700">ผู้ใช้</h3>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setMsg(null); }}>
            + เพิ่มผู้ใช้
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">ค้นหา</label>
            <input className="input" placeholder="ชื่อ / อีเมล / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label className="label">ประเภทการจ้าง</label>
            <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">ทุกประเภท</option>
              {Object.entries(EMP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="active">ใช้งาน (active)</option>
              <option value="inactive">ปิดใช้งาน (inactive)</option>
            </select>
          </div>
        </div>
        <div className="text-sm text-slate-500">แสดง {shown.length} คน</div>
        <div className="text-xs text-slate-400">
          รหัสผ่านเริ่มต้นของผู้ใช้คือ เบอร์โทรศัพท์ (ถ้าไม่มีเบอร์คือ 0123456789) — ระบบเก็บรหัสผ่านแบบเข้ารหัส จึงแสดงได้เฉพาะค่าเริ่มต้น หากผู้ใช้เปลี่ยนรหัสเอง สามารถกดปุ่ม “รีเซ็ตรหัสผ่านทั้งหมด” เพื่อตั้งกลับเป็นเบอร์โทร
        </div>
      </div>

      {ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-brand-light text-left text-xs font-bold text-slate-700">
              <th className="px-3 py-2">ชื่อ-นามสกุล</th>
              <th className="px-3 py-2">อีเมล</th>
              <th className="px-3 py-2">รหัสผ่าน (เบอร์โทร)</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2">รหัส/TOR</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className={`border-b border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-brand-light/40 ${u.active === false ? "opacity-60" : ""}`}>
                <td className="px-3 py-2 font-medium text-slate-700">
                  {u.title} {u.full_name}
                  {u.role === "admin" && <span className="badge ml-1 bg-slate-200 text-slate-600">admin</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2">
                  {u.role === "admin" ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <span className="font-mono text-slate-600">{u.phone || "0123456789"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`badge ${EMP_BADGE[u.employment_type] || ""}`}>{EMP_LABELS[u.employment_type] || u.employment_type}</span>
                </td>
                <td className="px-3 py-2 text-slate-500">{u.student_id || u.tor_number || "—"}</td>
                <td className="px-3 py-2">
                  {u.role === "admin" ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.active !== false}
                        onClick={() => toggleActive(u)}
                        title={u.active === false ? "inactive — คลิกเพื่อเปิดใช้งาน" : "active — คลิกเพื่อปิดใช้งาน"}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          u.active === false ? "bg-slate-300" : "bg-emerald-500"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            u.active === false ? "translate-x-0.5" : "translate-x-[22px]"
                          }`}
                        />
                      </button>
                      <span className={`text-xs font-medium ${u.active === false ? "text-slate-400" : "text-emerald-600"}`}>
                        {u.active === false ? "inactive" : "active"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1.5">
                    <button className="btn-edit" onClick={() => { setForm({ ...EMPTY, ...u, password: "" }); setMsg(null); }}>แก้ไข</button>
                    {u.role !== "admin" && (
                      <button className="btn-danger" onClick={() => remove(u)}>ลบ</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">ไม่พบผู้ใช้</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={editing ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">คำนำหน้า</label>
                <select className="input" value={form.title || ""} onChange={set("title")}>
                  <option value="">—</option>
                  <option value="นาย">นาย</option>
                  <option value="นาง">นาง</option>
                  <option value="นางสาว">นางสาว</option>
                  {form.title && !["นาย", "นาง", "นางสาว"].includes(form.title) && (
                    <option value={form.title}>{form.title}</option>
                  )}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">ชื่อ-นามสกุล *</label>
                <input className="input" value={form.full_name} onChange={set("full_name")} required />
              </div>
              <div className="sm:col-span-3">
                <label className="label">อีเมล *</label>
                <input className="input" type="email" placeholder="name@cmu.ac.th" value={form.email} onChange={set("email")} required />
              </div>
              <div>
                <label className="label">เบอร์โทร</label>
                <input className="input" value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="label">ประเภทการจ้าง</label>
                <select className="input" value={form.employment_type} onChange={set("employment_type")}>
                  {Object.entries(EMP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">รหัสนักศึกษา</label>
                <input className="input" value={form.student_id} onChange={set("student_id")} />
              </div>
              {form.employment_type !== "SCHOLARSHIP" && (
                <div>
                  <label className="label">เลข TOR</label>
                  <input className="input" value={form.tor_number} onChange={set("tor_number")} />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label">รหัสผ่าน</label>
                <input className="input" type="text"
                  placeholder={form.id ? "เว้นว่าง = คงเดิม" : "เว้นว่าง = ใช้เบอร์โทร (หรือ 0123456789)"}
                  value={form.password} onChange={set("password")} />
              </div>
            </div>
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
