"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMP_LABELS, EMP_BADGE, TH_MONTHS } from "@/lib/constants";
import { thb, entryHours as calcHours, entryCost as calcCost, isModule } from "@/lib/calc";
import Modal from "@/components/Modal";

function entryHours(r) {
  return r.section ? calcHours(r.section, r) : 0;
}
function entryCost(r) {
  return r.section ? calcCost(r.section, r) : 0;
}
function sumHours(list) {
  return Math.round(list.reduce((a, r) => a + entryHours(r), 0) * 100) / 100;
}
function sumCost(list) {
  return Math.round(list.reduce((a, r) => a + entryCost(r), 0) * 100) / 100;
}

export default function TimesheetViewer() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [curriculum, setCurriculum] = useState("");
  const [type, setType] = useState("");
  const [term, setTerm] = useState("");
  const [data, setData] = useState({ rows: [], curricula: [], terms: [] });
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState("user"); // user | date

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ month });
    if (curriculum) qs.set("curriculum", curriculum);
    if (type) qs.set("type", type);
    if (term) qs.set("term", term);
    const res = await fetch(`/api/admin/timesheets?${qs}`);
    const d = await res.json();
    setData(d);
    if (!term && d.term) setTerm(d.term);
    setLoading(false);
  }, [month, curriculum, type, term]);

  useEffect(() => { load(); }, [load]);

  const [yy, mm] = month.split("-").map(Number);
  const rows = data.rows || [];

  // group by user
  const byUser = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const k = r.user?.id;
      if (!m.has(k)) m.set(k, { user: r.user, entries: [] });
      m.get(k).entries.push(r);
    });
    return [...m.values()].sort((a, b) =>
      (a.user?.full_name || "").localeCompare(b.user?.full_name || "", "th")
    );
  }, [rows]);

  function exportCsv() {
    const header = ["ผู้ช่วยสอน", "ประเภทการจ้าง", "อีเมล", "รหัส/TOR", "วันที่", "รหัสวิชา", "ชื่อวิชา", "ตอน", "หลักสูตร", "ประเภท", "เวลา", "ชั่วโมง", "ค่าจ้าง(บาท)", "หมายเหตุ"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const cells = [
        r.user?.full_name, EMP_LABELS[r.user?.employment_type] || r.user?.employment_type,
        r.user?.email, r.user?.student_id || r.user?.tor_number || "",
        r.work_date, r.section?.course?.code, r.section?.course?.name,
        r.section?.section, r.section?.curriculum?.code, r.section?.teaching_type,
        `${r.section?.start_time || ""}-${r.section?.end_time || ""}`,
        entryHours(r), entryCost(r), r.remark || "",
      ].map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function shiftMonth(delta) {
    const dt = new Date(yy, mm - 1 + delta, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => shiftMonth(-1)}>←</button>
          <div className="min-w-[140px] text-center font-semibold text-slate-700">
            {TH_MONTHS[mm - 1]} {yy + 543}
          </div>
          <button className="btn-ghost" onClick={() => shiftMonth(1)}>→</button>
        </div>
        <div>
          <label className="label">ปีการศึกษา</label>
          <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
            {(data.terms || []).map((t) => (
              <option key={t.code} value={t.code}>{t.code}{t.is_active ? " (ใช้งาน)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">หลักสูตร</label>
          <select className="input" value={curriculum} onChange={(e) => setCurriculum(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {(data.curricula || []).map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ประเภทการจ้าง</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {Object.entries(EMP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">มุมมอง</label>
          <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="user">จัดกลุ่มตามผู้ช่วยสอน</option>
            <option value="date">เรียงตามวันที่</option>
          </select>
        </div>
        <div className="ml-auto">
          <button className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>
            ⬇ ส่งออก CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="วันทำงานรวม" value={rows.length} />
        <Stat label="ผู้ช่วยสอน" value={byUser.length} />
        <Stat label="รวมชั่วโมง" value={sumHours(rows)} />
        <Stat label="รวมค่าจ้าง (บาท)" value={thb(sumCost(rows))} accent="emerald" />
      </div>

      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      {!loading && rows.length === 0 && (
        <div className="card text-center text-sm text-slate-400">ไม่มีข้อมูลในเดือนนี้</div>
      )}

      {/* Grouped by user */}
      {!loading && groupBy === "user" && byUser.map((g) => (
        <div key={g.user?.id} className="card">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-800">{g.user?.full_name}</div>
              <div className="text-xs text-slate-400">{g.user?.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${EMP_BADGE[g.user?.employment_type] || ""}`}>
                {EMP_LABELS[g.user?.employment_type] || g.user?.employment_type}
              </span>
              <span className="badge bg-brand-light text-brand">{g.entries.length} วัน</span>
              <span className="badge bg-slate-100 text-slate-600">{sumHours(g.entries)} ชม.</span>
              <span className="badge bg-emerald-100 text-emerald-700">{thb(sumCost(g.entries))} บาท</span>
              <a
                className="btn-ghost text-xs"
                href={`/api/timesheet/export?user_id=${g.user?.id}&month=${month}&term=${term}`}
              >
                ⬇ รวมไฟล์ .xlsx
              </a>
              <a
                className="btn-ghost text-xs"
                href={`/api/timesheet/export-split?user_id=${g.user?.id}&month=${month}&term=${term}`}
              >
                ⬇ แยก section .zip
              </a>
            </div>
          </div>
          <Table entries={g.entries} showUser={false} reload={load} />
        </div>
      ))}

      {/* Flat by date */}
      {!loading && groupBy === "date" && rows.length > 0 && (
        <div className="card">
          <Table entries={rows} showUser={true} reload={load} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="card py-3">
      <div className={`text-2xl font-bold ${accent === "emerald" ? "text-emerald-600" : "text-brand"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

async function deleteEntry(r, reload) {
  if (!confirm(`ลบการลงเวลา ${r.work_date}?`)) return;
  await fetch(`/api/admin/entry?id=${r.id}`, { method: "DELETE" });
  reload && reload();
}

function Table({ entries, showUser, reload }) {
  const sorted = entries.slice().sort((a, b) => a.work_date.localeCompare(b.work_date));
  const [edit, setEdit] = useState(null); // { id, work_date, remark }

  async function saveEdit(e) {
    e.preventDefault();
    const body = { id: edit.id, work_date: edit.work_date, remark: edit.remark };
    if (edit.isModule) body.hours = edit.hours;
    await fetch("/api/admin/entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEdit(null);
    reload && reload();
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-light text-left text-xs font-bold text-slate-700">
            <th className="px-3 py-2">วันที่</th>
            {showUser && <th className="px-3 py-2">ผู้ช่วยสอน</th>}
            <th className="px-3 py-2">วิชา / ตอน</th>
            <th className="px-3 py-2">หลักสูตร</th>
            <th className="px-3 py-2">ประเภท</th>
            <th className="px-3 py-2 text-right">ชม.</th>
            <th className="px-3 py-2 text-right">ค่าจ้าง</th>
            <th className="px-3 py-2">หมายเหตุ</th>
            <th className="px-3 py-2 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-brand-light/40">
              <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">{r.work_date}</td>
              {showUser && <td className="px-3 py-2">{r.user?.full_name}</td>}
              <td className="px-3 py-2">
                <span className="text-slate-700">{r.section?.course?.code}</span>{" "}
                <span className="text-slate-400">{r.section?.course?.name}</span>{" "}
                <span className="text-slate-400">· ตอน {r.section?.section}</span>
              </td>
              <td className="px-3 py-2">{r.section?.curriculum?.code}</td>
              <td className="px-3 py-2">{r.section?.teaching_type}</td>
              <td className="px-3 py-2 text-right text-slate-600">{entryHours(r)}</td>
              <td className="px-3 py-2 text-right text-emerald-700">{thb(entryCost(r))}</td>
              <td className="px-3 py-2 text-slate-500">{r.remark || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right">
                <div className="flex justify-end gap-1.5">
                  <button className="btn-edit" onClick={() => setEdit({ id: r.id, work_date: r.work_date, remark: r.remark || "", isModule: isModule(r.section) || r.hours != null, hours: r.hours ?? "" })}>แก้ไข</button>
                  <button className="btn-danger" onClick={() => deleteEntry(r, reload)}>ลบ</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 text-xs font-bold text-slate-700">
            <td className="px-3 py-2" colSpan={showUser ? 5 : 4}>รวม {sorted.length} วัน</td>
            <td className="px-3 py-2 text-right">{sumHours(sorted)}</td>
            <td className="px-3 py-2 text-right text-emerald-700">{thb(sumCost(sorted))}</td>
            <td /><td />
          </tr>
        </tfoot>
      </table>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="แก้ไขการลงเวลา">
        {edit && (
          <form onSubmit={saveEdit} className="space-y-3">
            <div>
              <label className="label">วันที่</label>
              <input type="date" className="input" value={edit.work_date}
                onChange={(e) => setEdit({ ...edit, work_date: e.target.value })} required />
            </div>
            {edit.isModule && (
              <div>
                <label className="label">จำนวนชั่วโมง (Module)</label>
                <input type="number" min="0" step="0.5" className="input" value={edit.hours}
                  onChange={(e) => setEdit({ ...edit, hours: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">หมายเหตุ</label>
              <textarea className="input min-h-[70px]" value={edit.remark}
                onChange={(e) => setEdit({ ...edit, remark: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
