"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMP_LABELS, EMP_BADGE, TH_MONTHS } from "@/lib/constants";
import { thb, entryHours as calcHours, entryCost as calcCost, isModule } from "@/lib/calc";
import Spinner from "@/components/Spinner";

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

// group a user's entries by section -> [{ section, hours, cost }]
function bySection(entries) {
  const m = new Map();
  entries.forEach((r) => {
    const k = r.section?.id ?? "—";
    if (!m.has(k)) m.set(k, { section: r.section, hours: 0, cost: 0 });
    const g = m.get(k);
    g.hours = Math.round((g.hours + entryHours(r)) * 100) / 100;
    g.cost = Math.round((g.cost + entryCost(r)) * 100) / 100;
  });
  return [...m.values()].sort((a, b) =>
    (a.section?.course?.code || "").localeCompare(b.section?.course?.code || "")
  );
}

export default function TimesheetViewer() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [curriculum, setCurriculum] = useState("");
  const [type, setType] = useState("");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState({ rows: [], curricula: [], terms: [] });
  const [loading, setLoading] = useState(false);

  // Only (month, term) hit the server. curriculum/type/search are filtered
  // client-side from the already-loaded rows, so those changes are instant.
  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ month });
    if (term) qs.set("term", term);
    const res = await fetch(`/api/admin/timesheets?${qs}`);
    const d = await res.json();
    setData(d);
    if (!term && d.term) setTerm(d.term);
    setLoading(false);
  }, [month, term]);

  useEffect(() => { load(); }, [load]);

  const [yy, mm] = month.split("-").map(Number);
  // client-side curriculum + type filtering (no refetch)
  const rows = useMemo(() => {
    let r = data.rows || [];
    if (curriculum) r = r.filter((x) => String(x.section?.curriculum_id) === String(curriculum));
    if (type) r = r.filter((x) => x.user?.employment_type === type);
    return r;
  }, [data.rows, curriculum, type]);

  // clamp the month switcher to the selected term's range (เปิดเทอม → ปิดเทอม)
  const activeTerm = (data.terms || []).find((t) => t.code === term);
  const minMonth = activeTerm?.start_date ? activeTerm.start_date.slice(0, 7) : null;
  const maxMonth = activeTerm?.end_date ? activeTerm.end_date.slice(0, 7) : null;

  useEffect(() => {
    if (!minMonth && !maxMonth) return;
    setMonth((m) => {
      if (minMonth && m < minMonth) return minMonth;
      if (maxMonth && m > maxMonth) return maxMonth;
      return m;
    });
  }, [minMonth, maxMonth]);

  const canPrev = !minMonth || month > minMonth;
  const canNext = !maxMonth || month < maxMonth;

  const byUser = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const k = r.user?.id;
      if (!m.has(k)) m.set(k, { user: r.user, entries: [] });
      m.get(k).entries.push(r);
    });
    let list = [...m.values()];
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((g) =>
        (g.user?.full_name || "").toLowerCase().includes(needle) ||
        (g.user?.email || "").toLowerCase().includes(needle)
      );
    }
    return list.sort((a, b) => (a.user?.full_name || "").localeCompare(b.user?.full_name || "", "th"));
  }, [rows, q]);

  function shiftMonth(delta) {
    const dt = new Date(yy, mm - 1 + delta, 1);
    const next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (minMonth && next < minMonth) return;
    if (maxMonth && next > maxMonth) return;
    setMonth(next);
  }

  const dl = (base, uid, sid) =>
    `${base}?user_id=${uid}&month=${month}&term=${term}${sid ? `&section_id=${sid}` : ""}`;

  async function deleteSection(uid, section, name) {
    const label = `${section?.course?.code || ""} ตอน ${section?.section || ""}`;
    if (!confirm(`ลบข้อมูล timesheet ของ ${name}\nวิชา ${label}\nประจำเดือน ${TH_MONTHS[mm - 1]} ${yy + 543}?\n\nการกระทำนี้ย้อนกลับไม่ได้`)) return;
    const qs = `user_id=${uid}&section_id=${section?.id}&month=${month}&term=${term}`;
    const res = await fetch(`/api/admin/timesheets?${qs}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error || "ลบไม่สำเร็จ"); return; }
    load();
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" disabled={!canPrev} onClick={() => shiftMonth(-1)}>←</button>
          <div className="min-w-[140px] text-center font-semibold text-slate-700">
            {TH_MONTHS[mm - 1]} {yy + 543}
          </div>
          <button className="btn-ghost" disabled={!canNext} onClick={() => shiftMonth(1)}>→</button>
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
        <div className="min-w-[180px] flex-1">
          <label className="label">ค้นหาผู้ช่วยสอน</label>
          <input className="input" placeholder="ชื่อ / อีเมล" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="ผู้ช่วยสอน" value={byUser.length} />
        <Stat label="รวมชั่วโมง" value={sumHours(rows)} />
        <Stat label="รวมค่าจ้าง (บาท)" value={thb(sumCost(rows))} accent="emerald" />
      </div>

      {loading && <Spinner />}
      {!loading && byUser.length === 0 && (
        <div className="card text-center text-sm text-slate-400">ไม่มีข้อมูลในเดือนนี้</div>
      )}

      {/* One card per TA */}
      {!loading && byUser.map((g) => {
        const secs = bySection(g.entries);
        const uid = g.user?.id;
        return (
          <div key={uid} className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-800">
                  {g.user?.title} {g.user?.full_name}
                  {g.user?.employment_type !== "TOR" && g.user?.student_id && (
                    <span className="ml-2 text-xs font-normal text-slate-400">รหัสนักศึกษา {g.user.student_id}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{g.user?.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${EMP_BADGE[g.user?.employment_type] || ""}`}>
                  {EMP_LABELS[g.user?.employment_type] || g.user?.employment_type}
                </span>
                <span className="badge bg-slate-100 text-slate-600">{sumHours(g.entries)} ชม.</span>
                <span className="badge bg-emerald-100 text-emerald-700">{thb(sumCost(g.entries))} บาท</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-light text-left text-xs font-bold text-slate-700">
                    <th className="px-3 py-2">วิชา</th>
                    <th className="px-3 py-2">ตอน</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2 text-right">ชั่วโมง</th>
                    <th className="px-3 py-2 text-right">ยอดเงิน (บาท)</th>
                    <th className="px-3 py-2 text-right">ดาวน์โหลด</th>
                    <th className="px-3 py-2 text-right">ลบ</th>
                  </tr>
                </thead>
                <tbody>
                  {secs.map(({ section, hours, cost }) => (
                    <tr key={section?.id} className="odd:bg-white even:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-700">{section?.course?.code}</span>{" "}
                        <span className="text-slate-500">{section?.course?.name}</span>
                        {g.user?.employment_type === "TOR" && (
                          <div className="text-xs text-amber-700">เลข TOR: {section?.tor_number || g.user?.tor_number || "—"}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{section?.section}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`badge ${section?.teaching_type === "LAB" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                          {isModule(section) ? "MODULE" : (section?.teaching_type || "—")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{hours}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">{thb(cost)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <a className="btn-edit" href={dl("/api/timesheet/export", uid, section?.id)}>.xlsx</a>
                          <a className="btn-soft" href={dl("/api/timesheet/export-pdf", uid, section?.id)}>.pdf</a>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button className="btn-danger" onClick={() => deleteSection(uid, section, `${g.user?.title || ""} ${g.user?.full_name}`.trim())}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 text-xs font-bold text-slate-700">
                    <td className="px-3 py-2" colSpan={3}>รวม {secs.length} วิชา/ตอน</td>
                    <td className="px-3 py-2 text-right">{sumHours(g.entries)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{thb(sumCost(g.entries))}</td>
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
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
