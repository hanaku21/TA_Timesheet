"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Modal from "@/components/Modal";
import { isModule } from "@/lib/calc";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "Mon, Thu 14:00 - 15:30" from teaching_days + start/end time
function scheduleText(s) {
  const days = Array.isArray(s.teaching_days) ? s.teaching_days : [];
  const time = s.start_time && s.end_time ? `${s.start_time} - ${s.end_time}` : (s.start_time || s.end_time || "");
  if (days.length && time) return `${days.join(", ")} ${time}`;
  if (days.length) return days.join(", ");
  return time || "—";
}
const EMPTY_SEC = {
  id: null, course_id: "", section: "", curriculum_id: "", teaching_type: "LEC",
  teaching_days: [], start_time: "", end_time: "", instructor: "", rate: "", expected_cost: "",
};

export default function SectionsManager() {
  const [data, setData] = useState({ sections: [], courses: [], curricula: [], term: "" });
  const [users, setUsers] = useState([]);
  const [secForm, setSecForm] = useState(null);
  const [courseForm, setCourseForm] = useState(null);
  const [assignForm, setAssignForm] = useState(null); // { sectionId, assignId, user_id, origUserId }
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState("");
  const [curFilter, setCurFilter] = useState("");

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/admin/sections").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ]);
    setData(a);
    setUsers(b.users || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // group sections under their course; include courses with no sections
  const groups = useMemo(() => {
    const m = new Map();
    (data.courses || []).forEach((c) =>
      m.set(c.id, { course: c, sections: [] })
    );
    (data.sections || []).forEach((s) => {
      if (!m.has(s.course_id)) m.set(s.course_id, { course: s.course, sections: [] });
      m.get(s.course_id).sections.push(s);
    });
    return [...m.values()].sort((a, b) => (a.course?.code || "").localeCompare(b.course?.code || ""));
  }, [data]);

  // apply search (course code/name or TA name) + curriculum filter
  const shownGroups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (curFilter && String(g.course?.curriculum_id) !== String(curFilter)) return false;
      if (!kw) return true;
      const inCourse = `${g.course?.code || ""} ${g.course?.name || ""}`.toLowerCase().includes(kw);
      const inTA = g.sections.some((s) =>
        (s.assignments || []).some((a) => (a.user?.full_name || "").toLowerCase().includes(kw))
      );
      return inCourse || inTA;
    });
  }, [groups, q, curFilter]);

  // ---------- sections ----------
  const setS = (k) => (e) => setSecForm({ ...secForm, [k]: e.target.value });
  function toggleDay(d) {
    const has = secForm.teaching_days.includes(d);
    setSecForm({ ...secForm, teaching_days: has ? secForm.teaching_days.filter((x) => x !== d) : [...secForm.teaching_days, d] });
  }
  async function saveSection(e) {
    e.preventDefault();
    setMsg(null);
    const editing = !!secForm.id;
    const res = await fetch("/api/admin/sections", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(secForm),
    });
    const d = await res.json();
    if (!res.ok) { setMsg({ type: "error", text: d.error }); return; }
    setSecForm(null); load();
  }
  async function delSection(s) {
    if (!confirm(`ลบ section ${s.course?.code} ตอน ${s.section}? (timesheet ที่เกี่ยวข้องจะถูกลบ)`)) return;
    await fetch(`/api/admin/sections?id=${s.id}`, { method: "DELETE" });
    load();
  }

  // ---------- assignments ----------
  async function saveAssign(e) {
    e.preventDefault();
    if (!assignForm.user_id) return;
    // one TA per section: upsert replaces any current TA automatically
    const res = await fetch("/api/admin/assignments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: Number(assignForm.user_id), section_id: assignForm.sectionId }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error); return; }
    setAssignForm(null); load();
  }
  async function delAssign(id) {
    if (!confirm("ลบผู้ช่วยสอนออกจาก section นี้?")) return;
    await fetch(`/api/admin/assignments?id=${id}`, { method: "DELETE" });
    load();
  }

  // ---------- courses ----------
  const setC = (k) => (e) => setCourseForm({ ...courseForm, [k]: e.target.value });
  async function saveCourse(e) {
    e.preventDefault();
    const editing = !!courseForm.id;
    const res = await fetch("/api/admin/courses", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseForm),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error); return; }
    setCourseForm(null); load();
  }
  async function delCourse(c) {
    if (!confirm(`ลบวิชา ${c.code}? (section/timesheet ของวิชานี้จะถูกลบทั้งหมด)`)) return;
    await fetch(`/api/admin/courses?id=${c.id}`, { method: "DELETE" });
    load();
  }

  const curName = (id) => data.curricula.find((c) => c.id === id)?.code || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">ปีการศึกษาที่ใช้งาน: <b>{data.term}</b></div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setCourseForm({ id: null, code: "", name: "", curriculum_id: "" })}>+ วิชา</button>
          <button className="btn-primary" onClick={() => setSecForm({ ...EMPTY_SEC })}>+ Section</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">ค้นหา (รหัสวิชา / ชื่อวิชา / ชื่อ TA)</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์เพื่อค้นหา..." />
          </div>
          <div>
            <label className="label">หลักสูตร</label>
            <select className="input" value={curFilter} onChange={(e) => setCurFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {data.curricula.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>
        </div>
        <div className="text-sm text-slate-500">แสดง {shownGroups.length} วิชา</div>
      </div>

      {shownGroups.length === 0 && <div className="card text-center text-sm text-slate-400">ไม่พบวิชาที่ตรงกับตัวกรอง</div>}

      {/* Course cards, each with its sections */}
      <div className="space-y-3">
        {shownGroups.map(({ course, sections }) => (
          <div key={course?.id} className="card p-0 overflow-hidden">
            {/* Course header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-brand-light/60 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-800">
                  {course?.code} <span className="font-medium text-slate-600">{course?.name}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {course?.curriculum?.code || curName(course?.curriculum_id) || "—"} · {sections.length} section
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button className="btn-soft" onClick={() => setSecForm({ ...EMPTY_SEC, course_id: course?.id, curriculum_id: course?.curriculum_id || "" })}>+ Section</button>
                <button className="btn-edit" onClick={() => setCourseForm({ id: course?.id, code: course?.code, name: course?.name, curriculum_id: course?.curriculum_id || "" })}>แก้ไข</button>
                <button className="btn-danger" onClick={() => delCourse(course)}>ลบ</button>
              </div>
            </div>

            {/* Sections under this course */}
            {sections.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">ยังไม่มี section</div>
            ) : (
              <div>
                {sections.map((s, i) => (
                  <div key={s.id} className={`px-4 py-3 ${i % 2 ? "bg-slate-50" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-slate-700">ตอน {s.section}</span>
                          {isModule(s) ? (
                            <span className="badge bg-amber-100 text-amber-700">MODULE</span>
                          ) : (
                            <span className={`badge ${s.teaching_type === "LAB" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                              {s.teaching_type || "—"}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            🗓 {scheduleText(s)}
                          </span>
                          <span className="text-xs text-slate-400">· อัตรา {s.rate || "—"} · งบ {s.expected_cost ?? "—"}</span>
                        </div>
                        {/* TA (one per section) */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-400">ผู้ช่วยสอน:</span>
                          {s.assignments[0] ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-light py-0.5 pl-2.5 pr-1 text-xs text-brand">
                              {s.assignments[0].user?.full_name}
                              <button className="rounded-full px-1 text-brand/70 hover:bg-brand hover:text-white"
                                title="เปลี่ยนผู้ช่วยสอน"
                                onClick={() => setAssignForm({ sectionId: s.id, user_id: s.assignments[0].user?.id || "" })}>✎</button>
                              <button className="rounded-full px-1 text-red-500 hover:bg-red-500 hover:text-white"
                                title="ลบผู้ช่วยสอน" onClick={() => delAssign(s.assignments[0].id)}>×</button>
                            </span>
                          ) : (
                            <button className="btn-soft" onClick={() => setAssignForm({ sectionId: s.id, user_id: "" })}>+ กำหนดผู้ช่วยสอน</button>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button className="btn-edit" onClick={() => setSecForm({ ...EMPTY_SEC, ...s, teaching_days: s.teaching_days || [] })}>แก้ไข</button>
                        <button className="btn-danger" onClick={() => delSection(s)}>ลบ</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Course modal */}
      <Modal open={!!courseForm} onClose={() => setCourseForm(null)} title={courseForm?.id ? "แก้ไขวิชา" : "เพิ่มวิชา"}>
        {courseForm && (
          <form onSubmit={saveCourse} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">รหัสวิชา *</label>
                <input className="input" placeholder="เช่น 953104" value={courseForm.code} onChange={setC("code")} required />
              </div>
              <div>
                <label className="label">หลักสูตร</label>
                <select className="input" value={courseForm.curriculum_id || ""} onChange={setC("curriculum_id")}>
                  <option value="">— เลือก —</option>
                  {data.curricula.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">ชื่อวิชา *</label>
                <input className="input" placeholder="ชื่อวิชา" value={courseForm.name} onChange={setC("name")} required />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setCourseForm(null)}>ยกเลิก</button>
              <button className="btn-primary">บันทึกวิชา</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Section modal */}
      <Modal open={!!secForm} onClose={() => setSecForm(null)} title={secForm?.id ? "แก้ไข Section" : "เพิ่ม Section"} maxWidth="max-w-2xl">
        {secForm && (
          <form onSubmit={saveSection} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label">วิชา *</label>
                <select className="input" value={secForm.course_id || ""} onChange={setS("course_id")} required>
                  <option value="">— เลือกวิชา —</option>
                  {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">ตอน (section) *</label>
                <input className="input" placeholder="เช่น 001, 701-1" value={secForm.section} onChange={setS("section")} required />
              </div>
              <div>
                <label className="label">หลักสูตร</label>
                <select className="input" value={secForm.curriculum_id || ""} onChange={setS("curriculum_id")}>
                  <option value="">— เลือก —</option>
                  {data.curricula.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div>
                <label className="label">ประเภทการสอน</label>
                <select className="input" value={secForm.teaching_type || ""} onChange={setS("teaching_type")}>
                  <option value="LEC">LEC</option><option value="LAB">LAB</option>
                </select>
              </div>
              <div>
                <label className="label">อัตรา/ชม. (บาท)</label>
                <input className="input" placeholder="เช่น 200" value={secForm.rate || ""} onChange={setS("rate")} />
              </div>
              <div>
                <label className="label">เวลาเริ่ม</label>
                <input className="input" type="time" value={secForm.start_time || ""} onChange={setS("start_time")} />
              </div>
              <div>
                <label className="label">เวลาจบ</label>
                <input className="input" type="time" value={secForm.end_time || ""} onChange={setS("end_time")} />
              </div>
              <div>
                <label className="label">ค่าใช้จ่ายคาดการณ์ (บาท)</label>
                <input className="input" type="number" placeholder="เช่น 12000" value={secForm.expected_cost || ""} onChange={setS("expected_cost")} />
              </div>
              <div className="sm:col-span-3">
                <label className="label">ผู้สอน</label>
                <input className="input" placeholder="ชื่อผู้สอน" value={secForm.instructor || ""} onChange={setS("instructor")} />
              </div>
            </div>
            <div>
              <label className="label">วันสอน</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button type="button" key={d} onClick={() => toggleDay(d)}
                    className={`badge cursor-pointer ${secForm.teaching_days.includes(d) ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {msg?.type === "error" && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg.text}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setSecForm(null)}>ยกเลิก</button>
              <button className="btn-primary">บันทึก Section</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Assignment (TA) modal */}
      <Modal open={!!assignForm} onClose={() => setAssignForm(null)} title="กำหนดผู้ช่วยสอน (1 คนต่อ section)">
        {assignForm && (
          <form onSubmit={saveAssign} className="space-y-3">
            <div>
              <label className="label">เลือกผู้ช่วยสอน</label>
              <select className="input" value={assignForm.user_id} onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })} required>
                <option value="">— เลือก —</option>
                {users.filter((u) => u.active !== false).map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setAssignForm(null)}>ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
