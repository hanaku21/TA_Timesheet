"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMP_LABELS, EMP_BADGE, TH_MONTHS } from "@/lib/constants";
import { thb, entryHours as calcHours, entryCost as calcCost, hoursPerDay, toRate, isModule } from "@/lib/calc";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";

const WD_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function monthMatrix(year, month0) {
  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const days = new Date(year, month0 + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month0, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function entryHours(r) {
  return r.section ? calcHours(r.section, r) : 0;
}
// hours a day of this section is worth by its timetable (0 for module sections)
function schedHours(section) {
  return section && !isModule(section) ? hoursPerDay(section.start_time, section.end_time) : 0;
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
  const [courseQ, setCourseQ] = useState("");
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
  // client-side curriculum + type + course-code filtering (no refetch)
  const rows = useMemo(() => {
    let r = data.rows || [];
    if (curriculum) r = r.filter((x) => String(x.section?.curriculum_id) === String(curriculum));
    if (type) r = r.filter((x) => x.user?.employment_type === type);
    if (courseQ.trim()) {
      const needle = courseQ.trim().toLowerCase();
      r = r.filter((x) => (x.section?.course?.code || "").toLowerCase().includes(needle));
    }
    return r;
  }, [data.rows, curriculum, type, courseQ]);

  // clamp the month switcher to the selected term's range (เปิดเทอม → ปิดเทอม).
  // DII follows its own calendar; when the DII curriculum filter is selected,
  // unlock the range so its off-term months are viewable.
  const activeTerm = (data.terms || []).find((t) => t.code === term);
  const diiId = (data.curricula || []).find((c) => (c.code || "").toUpperCase() === "DII")?.id;
  const diiSelected = diiId != null && String(curriculum) === String(diiId);
  const minMonth = diiSelected ? null : activeTerm?.start_date ? activeTerm.start_date.slice(0, 7) : null;
  const maxMonth = diiSelected ? null : activeTerm?.end_date ? activeTerm.end_date.slice(0, 7) : null;

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

  // สรุปค่าใช้จ่ายแยกตามประเภทการจ้าง (.xlsx) — follows the current month/term/filters
  const summaryUrl = (() => {
    const qs = new URLSearchParams({ month });
    if (term) qs.set("term", term);
    if (curriculum) qs.set("curriculum", curriculum);
    if (type) qs.set("type", type);
    return `/api/admin/summary?${qs}`;
  })();

  const confirmedSet = new Set(data.confirmed || []); // "user|section"
  const isConfirmed = (uid, sid) => confirmedSet.has(`${uid}|${sid}`);
  const schRate = data.scholarshipRate || 50;

  // ---- calendar popup (view + admin edit of a single day's hours) ----
  const [calFor, setCalFor] = useState(null); // { uid, name, section, emp }
  const [selDay, setSelDay] = useState(null);  // "YYYY-MM-DD"
  const [hoursInput, setHoursInput] = useState("");
  const [calBusy, setCalBusy] = useState(false);
  function openCalendar(userObj, section) {
    setSelDay(null);
    setHoursInput("");
    setCalFor({ uid: userObj?.id, name: `${userObj?.title || ""} ${userObj?.full_name}`.trim(), section, emp: userObj?.employment_type });
  }
  // entries of the open calendar, always derived from the latest loaded rows
  const calDates = useMemo(() => {
    if (!calFor) return {};
    const map = {};
    (data.rows || [])
      .filter((e) => String(e.user?.id) === String(calFor.uid) && String(e.section?.id) === String(calFor.section?.id))
      .forEach((e) => { map[e.work_date] = { id: e.id, hours: entryHours(e), raw: e.hours }; });
    return map;
  }, [calFor, data.rows]);
  const calSchedHours = calFor ? schedHours(calFor.section) : 0;
  const calRate = calFor ? toRate(calFor.section?.rate) : 0;
  const calConfirmed = calFor ? confirmedSet.has(`${calFor.uid}|${calFor.section?.id}`) : false;
  function pickDay(d) {
    const key = ymd(d);
    setSelDay(key);
    const cur = calDates[key];
    setHoursInput(cur ? String(cur.hours) : String(calSchedHours || ""));
  }
  // what the month would look like after the pending edit (ทุน ป.ตรี: converted too)
  const calPreview = useMemo(() => {
    if (!calFor) return null;
    const h = Number(hoursInput);
    const list = Object.entries(calDates).map(([d, v]) => ({ d, hours: v.hours }));
    const cur = { days: list.length, hours: list.reduce((a, x) => a + x.hours, 0) };
    let next = list.filter((x) => x.d !== selDay);
    if (selDay && Number.isFinite(h) && h > 0) next = [...next, { d: selDay, hours: h }];
    const money = (arr) => Math.round(arr.reduce((a, x) => a + Math.round(x.hours * calRate * 100) / 100, 0) * 100) / 100;
    const conv = (arr) => {
      const billed = arr.reduce((a, x) => Math.round((a + Math.round((Math.round(x.hours * calRate * 100) / 100) / schRate * 100) / 100) * 100) / 100, 0);
      const hh = Math.round(billed * 2) / 2;
      return { hours: hh, money: Math.round(hh * schRate * 100) / 100 };
    };
    return {
      cur: { ...cur, hours: Math.round(cur.hours * 100) / 100, money: money(list), conv: conv(list) },
      next: { days: next.length, hours: Math.round(next.reduce((a, x) => a + x.hours, 0) * 100) / 100, money: money(next), conv: conv(next) },
    };
  }, [calFor, calDates, selDay, hoursInput, calRate, schRate]);
  async function saveDay(mode) {
    if (!calFor || !selDay) return;
    const cur = calDates[selDay];
    const h = Number(hoursInput);
    let res;
    setCalBusy(true);
    try {
      if (mode === "delete") {
        if (!cur) return;
        if (!confirm(`ลบวันที่ ${selDay} ของ ${calFor.name}?`)) return;
        res = await fetch(`/api/admin/entry?id=${cur.id}`, { method: "DELETE" });
      } else if (mode === "reset") {
        if (!cur) return;
        res = await fetch("/api/admin/entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cur.id, hours: null }) });
      } else {
        if (!Number.isFinite(h) || h <= 0) { alert("กรุณากรอกจำนวนชั่วโมงมากกว่า 0"); return; }
        if (cur) {
          res = await fetch("/api/admin/entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cur.id, hours: h }) });
        } else {
          res = await fetch("/api/admin/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: calFor.uid, section_id: calFor.section?.id, work_date: selDay, hours: h }) });
        }
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "บันทึกไม่สำเร็จ"); return; }
      await load();
      if (mode === "delete") setSelDay(null);
    } finally {
      setCalBusy(false);
    }
  }

  // ทุน ป.ตรี: converted hours + claimable amount (50฿/hr) per user|section
  const conv = data.converted || {};
  const convOf = (uid, sid) => conv[`${uid}|${sid}`] || null;

  // Who is expected to fill this month (respecting the curriculum + type filters)
  // vs. who actually has entries → drives the "ยังไม่กรอก" drill-down.
  const expectedUsers = useMemo(() => {
    let list = data.assignedUsers || [];
    if (type) list = list.filter((u) => u.employment_type === type);
    if (curriculum) list = list.filter((u) => (u.curriculum_ids || []).map(String).includes(String(curriculum)));
    return list;
  }, [data.assignedUsers, type, curriculum]);
  // Confirmation progress measured against ASSIGNED วิชา/ตอน (not just those with
  // data), so all three cards are mutually consistent:
  //   • ยืนยันแล้ว (วิชา/ตอน) = assigned units that are confirmed / all assigned units
  //   • ยืนยันครบ (คน)        = people who confirmed EVERY assigned section of theirs
  const progress = useMemo(() => {
    let units = data.assignedUnits || [];
    if (type) units = units.filter((u) => u.employment_type === type);
    if (curriculum) units = units.filter((u) => String(u.curriculum_id) === String(curriculum));
    const confSet = new Set(data.confirmed || []);
    let confirmedUnits = 0;
    const totalByUser = {}, confByUser = {};
    units.forEach((u) => {
      totalByUser[u.user_id] = (totalByUser[u.user_id] || 0) + 1;
      if (confSet.has(`${u.user_id}|${u.section_id}`)) {
        confirmedUnits += 1;
        confByUser[u.user_id] = (confByUser[u.user_id] || 0) + 1;
      }
    });
    const peopleDone = Object.keys(totalByUser).filter(
      (uid) => (confByUser[uid] || 0) === totalByUser[uid]
    ).length;
    return { totalUnits: units.length, confirmedUnits, peopleDone };
  }, [data.assignedUnits, data.confirmed, type, curriculum]);
  const filledIds = useMemo(() => new Set(rows.map((r) => r.user?.id)), [rows]);
  const notFilled = useMemo(
    () =>
      expectedUsers
        .filter((u) => !filledIds.has(u.id))
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "th")),
    [expectedUsers, filledIds]
  );
  const [showNotFilled, setShowNotFilled] = useState(false);

  // ---- Budget: expected_cost vs. used (whole term) per assigned section ----
  const budgetRows = useMemo(() => {
    let list = data.budgets || [];
    if (type) list = list.filter((b) => b.employment_type === type);
    if (curriculum) list = list.filter((b) => String(b.curriculum_id) === String(curriculum));
    if (courseQ.trim()) {
      const needle = courseQ.trim().toLowerCase();
      list = list.filter((b) => (b.course_code || "").toLowerCase().includes(needle));
    }
    return list;
  }, [data.budgets, type, curriculum, courseQ]);
  // per section + per person lookups used inside each TA card
  const budgetBySection = useMemo(() => {
    const m = {};
    budgetRows.forEach((b) => { m[b.section_id] = b; });
    return m;
  }, [budgetRows]);
  const budgetByUser = useMemo(() => {
    const m = {};
    budgetRows.forEach((b) => {
      const g = (m[b.user_id] ||= { sections: 0, budget: 0, used: 0, month: 0, remaining: 0, noBudget: 0 });
      g.sections += 1;
      g.used += b.used;
      g.month += b.month;
      if (b.budget == null) g.noBudget += 1;
      else { g.budget += b.budget; g.remaining += b.remaining; }
    });
    return m;
  }, [budgetRows]);


  // submission progress across the currently-shown data
  const submitStats = useMemo(() => {
    const seen = new Set();
    let units = 0, confirmed = 0;
    const perUserTotal = {};
    const perUserConfirmed = {};
    rows.forEach((r) => {
      const uid = r.user?.id;
      const key = `${uid}|${r.section?.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      units += 1;
      perUserTotal[uid] = (perUserTotal[uid] || 0) + 1;
      if (confirmedSet.has(key)) {
        confirmed += 1;
        perUserConfirmed[uid] = (perUserConfirmed[uid] || 0) + 1;
      }
    });
    const peopleDone = Object.keys(perUserTotal).filter(
      (uid) => (perUserConfirmed[uid] || 0) === perUserTotal[uid]
    ).length;
    const peopleSubmitted = Object.keys(perUserConfirmed).length; // >=1 section confirmed
    return { units, confirmed, people: Object.keys(perUserTotal).length, peopleDone, peopleSubmitted };
  }, [rows, data.confirmed]);

  async function toggleConfirm(uid, section, name) {
    const on = isConfirmed(uid, section?.id);
    const label = `${section?.course?.code || ""} ตอน ${section?.section || ""}`;
    if (on) {
      // turning OFF = reject/unlock -> confirm the destructive action
      if (!confirm(`ยกเลิกการยืนยันของ ${name}\nวิชา ${label}\nประจำเดือน ${TH_MONTHS[mm - 1]} ${yy + 543}?\nผู้ใช้จะกลับมาแก้ไขวิชานี้ได้อีกครั้ง`)) return;
      const res = await fetch(`/api/admin/submissions?user_id=${uid}&section_id=${section?.id}&month=${month}&term=${term}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "ไม่สำเร็จ"); return; }
    } else {
      const res = await fetch("/api/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, section_id: section?.id, month, term }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "ไม่สำเร็จ"); return; }
    }
    load();
  }

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
          <label className="label">ภาคการศึกษา</label>
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
        <div className="min-w-[160px] flex-1">
          <label className="label">ค้นหาผู้ช่วยสอน</label>
          <input className="input" placeholder="ชื่อ / อีเมล" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <label className="label">ค้นหารหัสวิชา</label>
          <input className="input" placeholder="เช่น 954374" value={courseQ} onChange={(e) => setCourseQ(e.target.value)} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="กรอกข้อมูลแล้ว (คน)"
          value={`${submitStats.people} / ${expectedUsers.length}`}
          accent={expectedUsers.length > 0 && submitStats.people === expectedUsers.length ? "emerald" : undefined}
          hint={notFilled.length > 0 ? `ยังไม่กรอก ${notFilled.length} คน — คลิกเพื่อดู` : "กรอกครบทุกคน"}
          onClick={() => setShowNotFilled(true)}
        />
        {/* Confirmation is measured against what was actually logged this month —
            a section with no entries in the month cannot be confirmed, so it is not
            counted as "pending". The assigned totals are shown as a hint only. */}
        <Stat
          label="ยืนยันครบ (คน)"
          value={`${submitStats.peopleDone} / ${submitStats.people}`}
          accent={submitStats.people > 0 && submitStats.peopleDone === submitStats.people ? "emerald" : undefined}
          hint={submitStats.people > 0 && submitStats.peopleDone < submitStats.people
            ? `ยังไม่ครบ ${submitStats.people - submitStats.peopleDone} คน (จากคนที่กรอกเดือนนี้)`
            : "นับจากคนที่กรอกข้อมูลเดือนนี้"}
        />
        <Stat
          label="ยืนยันแล้ว (วิชา/ตอน)"
          value={`${submitStats.confirmed} / ${submitStats.units}`}
          accent={submitStats.units > 0 && submitStats.confirmed === submitStats.units ? "emerald" : undefined}
          hint={`มีข้อมูลเดือนนี้ ${submitStats.units} จาก ${progress.totalUnits} วิชา/ตอนที่มอบหมาย`}
        />
        <Stat label="รวมชั่วโมง" value={sumHours(rows)} />
        <Stat label="รวมค่าจ้าง (บาท)" value={thb(sumCost(rows))} accent="emerald" />
      </div>

      {/* Downloads: monthly (follows the filters) vs. whole-term (per person) */}
      {(() => {
        const termQ = `term=${encodeURIComponent(term || "")}`;
        const curLabel = curriculum ? (data.curricula || []).find((c) => String(c.id) === String(curriculum))?.code || "" : "";
        const DL = ({ href, title, desc, primary }) => (
          <a href={href} download className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 transition ${primary ? "bg-brand/5 ring-brand/30 hover:bg-brand/10" : "bg-white ring-slate-200 hover:bg-slate-50"}`}>
            <span className={`mt-0.5 text-lg leading-none ${primary ? "text-brand" : "text-slate-400 group-hover:text-brand"}`}>⬇</span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${primary ? "text-brand" : "text-slate-700"}`}>{title} <span className="font-normal text-slate-400">.xlsx</span></span>
              <span className="block text-xs text-slate-500">{desc}</span>
            </span>
          </a>
        );
        return (
          <div className="card">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-700">ดาวน์โหลดสรุป</h3>
              <span className="text-xs text-slate-400">ทุกไฟล์นับเฉพาะวิชา/ตอนที่กด "ยืนยันนำส่ง" แล้ว ยกเว้นที่ระบุไว้</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* ---- monthly ---- */}
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  รายเดือน · {TH_MONTHS[mm - 1]} {yy + 543}
                  {curLabel && <span className="ml-1 normal-case tracking-normal text-slate-400">· หลักสูตร {curLabel}</span>}
                  {type && <span className="ml-1 normal-case tracking-normal text-slate-400">· {EMP_LABELS[type]}</span>}
                </div>
                <DL primary href={summaryUrl} title="สรุปค่าใช้จ่าย + แบบ F-07"
                  desc="ชีต “สรุปรวม” (แยกประเภทการจ้าง + หลักสูตร, งบทั้งเทอม) และแบบ F-07 หลักฐานการจ่าย 1 ชีตต่อประเภท: จ้างเหมา (แยก TOR) / บัณฑิต (TA-RA) / ป.ตรี (รายคน-รายวิชา/ตอน) — ตามเดือนและตัวกรองที่เลือกอยู่" />
              </div>
              {/* ---- whole term ---- */}
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">ทั้งภาคการศึกษา {term || ""} · รายคน</div>
                <div className="grid gap-2">
                  <DL href={`/api/admin/summary-students?${termQ}`} title="ยอดเบิกรายคน แยกเดือน"
                    desc="3 ชีต: ป.ตรี / บัณฑิตศึกษา / จ้างเหมา (TOR) — 1 แถวต่อคน คอลัมน์ต่อเดือน + จำนวนเงินรวม" />
                  <DL href={`/api/admin/summary-grad?${termQ}`} title="รวมทั้งเทอมรายคน ชม. / ครั้ง / เงิน"
                    desc="2 ชีต: ป.ตรี (ชม.เบิกได้ + ยอดเบิก) / บัณฑิตศึกษา (ชม.จริง) — ทุกเดือนรวมเป็นตัวเลขเดียวต่อคน" />
                  <DL href={`/api/admin/summary-ug-detail?${termQ}`} title="ป.ตรี รายวิชา-รายเดือน (ละเอียด)"
                    desc="1 แถวต่อ คน × วิชา/ตอน × เดือน: จำนวนครั้ง, วันในเอกสาร, ชม.จริง, ชม.เบิกได้, เงินจริง, ยอดเบิก, งบวิชา — รวมรายการที่ยังไม่ยืนยันด้วย (มีคอลัมน์สถานะ)" />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {loading && <Spinner />}
      {!loading && byUser.length === 0 && (
        <div className="card text-center text-sm text-slate-400">ไม่มีข้อมูลในเดือนนี้</div>
      )}

      {/* One card per TA */}
      {!loading && byUser.map((g) => {
        const secs = bySection(g.entries);
        const uid = g.user?.id;
        const isSch = g.user?.employment_type === "SCHOLARSHIP";
        const convTotals = secs.reduce((a, { section }) => {
          const c = convOf(uid, section?.id);
          if (c) { a.hours = Math.round((a.hours + c.hours) * 100) / 100; a.money = Math.round((a.money + c.money) * 100) / 100; }
          return a;
        }, { hours: 0, money: 0 });
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
                {isSch && (
                  <span className="badge bg-amber-100 text-amber-700" title={`แปลงที่ ${schRate} บาท/ชม.`}>
                    เบิกได้ {convTotals.hours} ชม. · {thb(convTotals.money)} บาท
                  </span>
                )}
              </div>
            </div>

            {/* Budget per course/section for this person (whole term) */}
            {(() => {
              const g = budgetByUser[uid];
              if (!g) return null;
              return (
                <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold">งบรายวิชา (ทั้งภาคการศึกษา {term})</span>
                    <span>· {g.sections} วิชา/ตอน</span>
                    {g.noBudget > 0 && <span>· ไม่กำหนดงบ {g.noBudget} ตอน</span>}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {budgetRows.filter((b) => b.user_id === uid).map((b) => {
                      const bo = b.remaining != null && b.remaining < -1e-6;
                      const bl = !bo && b.budget > 0 && b.remaining / b.budget < 0.1;
                      const bp = b.budget > 0 ? Math.min(100, (b.used / b.budget) * 100) : 0;
                      return (
                        <div key={b.section_id} className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-slate-700" title={b.course_name}>
                              {b.course_code} <span className="text-slate-400">ตอน {b.section}</span>
                            </span>
                            {bo && <span className="badge bg-red-100 text-red-700">เกินงบ</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                            <span>เต็ม <b className="text-slate-700">{b.budget == null ? "—" : thb(b.budget)}</b></span>
                            <span>ใช้ไป <b className="text-brand">{thb(b.used)}</b></span>
                            <span>เหลือ <b className={bo ? "text-red-600" : bl ? "text-amber-600" : "text-emerald-700"}>{b.remaining == null ? "—" : thb(b.remaining)}</b></span>
                          </div>
                          {b.budget > 0 && (
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div className={`h-full ${bo ? "bg-red-400" : bl ? "bg-amber-400" : "bg-brand/70"}`} style={{ width: `${bp}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-brand-light text-left text-xs font-bold text-slate-700">
                    <th className="px-3 py-2">วิชา</th>
                    <th className="px-3 py-2">ตอน</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2 text-right">ชั่วโมง</th>
                    <th className="px-3 py-2 text-right">ยอดเงิน (บาท)</th>
                    <th className="px-3 py-2 text-right">งบเต็ม (ทั้งเทอม)</th>
                    <th className="px-3 py-2 text-right">ใช้ไป (ทั้งเทอม)</th>
                    <th className="px-3 py-2 text-right">คงเหลือ</th>
                    {isSch && <th className="px-3 py-2 text-right">ชม. เบิกได้ ({schRate}฿)</th>}
                    {isSch && <th className="px-3 py-2 text-right">ยอดเบิก (บาท)</th>}
                    <th className="px-3 py-2 text-right">ยืนยันข้อมูล</th>
                    <th className="px-3 py-2 text-right">ดาวน์โหลด</th>
                    <th className="px-3 py-2 text-right">ลบ</th>
                  </tr>
                </thead>
                <tbody>
                  {secs.map(({ section, hours, cost }) => (
                    <tr key={section?.id} className="odd:bg-white even:bg-slate-50">
                      <td className="px-3 py-2">
                        <button type="button" className="text-left hover:underline" title="ดูปฏิทินการลงเวลา"
                          onClick={() => openCalendar(g.user, section)}>
                          <span className="font-medium text-brand">{section?.course?.code}</span>{" "}
                          <span className="text-slate-500">{section?.course?.name}</span>
                        </button>
                        {g.user?.employment_type === "TOR" && (
                          <div className="text-xs text-amber-700">เลข TOR: {section?.tor_number || g.user?.tor_number || "—"}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{section?.section}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`badge ${section?.teaching_type === "LAB" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                          {section?.teaching_type || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{hours}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">{thb(cost)}</td>
                      {(() => {
                        const b = budgetBySection[section?.id];
                        if (!b) return <><td className="px-3 py-2 text-right text-slate-400">—</td><td className="px-3 py-2 text-right text-slate-400">—</td><td className="px-3 py-2 text-right text-slate-400">—</td></>;
                        const over = b.remaining != null && b.remaining < -1e-6;
                        const low = !over && b.budget > 0 && b.remaining / b.budget < 0.1;
                        return (
                          <>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {b.budget == null ? <span className="text-slate-400">—</span> : thb(b.budget)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600" title={`${b.days} วัน`}>{thb(b.used)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${over ? "text-red-600" : low ? "text-amber-600" : "text-slate-700"}`}>
                              {b.remaining == null ? <span className="font-normal text-slate-400">—</span> : thb(b.remaining)}
                            </td>
                          </>
                        );
                      })()}
                      {isSch && <td className="px-3 py-2 text-right font-medium text-amber-700">{convOf(uid, section?.id)?.hours ?? "—"}</td>}
                      {isSch && <td className="px-3 py-2 text-right font-medium text-amber-700">{convOf(uid, section?.id) ? thb(convOf(uid, section?.id).money) : "—"}</td>}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(() => {
                          const on = isConfirmed(uid, section?.id);
                          return (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                title={on ? "ยืนยันแล้ว — คลิกเพื่อยกเลิก" : "ยังไม่ยืนยัน — คลิกเพื่อยืนยัน"}
                                onClick={() => toggleConfirm(uid, section, `${g.user?.title || ""} ${g.user?.full_name}`.trim())}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}
                              >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                              </button>
                              <span className={`text-xs font-medium ${on ? "text-emerald-600" : "text-slate-400"}`}>
                                {on ? "ยืนยัน" : "ไม่ยืนยัน"}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
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
                    <td className="px-3 py-2 text-right text-slate-600">{budgetByUser[uid] ? thb(budgetByUser[uid].budget) : "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{budgetByUser[uid] ? thb(budgetByUser[uid].used) : "—"}</td>
                    <td className={`px-3 py-2 text-right ${budgetByUser[uid]?.remaining < 0 ? "text-red-600" : "text-slate-700"}`}>{budgetByUser[uid] ? thb(budgetByUser[uid].remaining) : "—"}</td>
                    {isSch && <td className="px-3 py-2 text-right text-amber-700">{convTotals.hours}</td>}
                    {isSch && <td className="px-3 py-2 text-right text-amber-700">{thb(convTotals.money)}</td>}
                    <td /><td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      <Modal
        open={showNotFilled}
        onClose={() => setShowNotFilled(false)}
        title={`ยังไม่กรอกข้อมูล — ${TH_MONTHS[mm - 1]} ${yy + 543}`}
      >
        <div className="mb-3 text-sm text-slate-600">
          กรอกแล้ว <b className="text-emerald-600">{submitStats.people}</b> / {expectedUsers.length} คน ·
          ยังไม่กรอก <b className="text-rose-600">{notFilled.length}</b> คน
          {(curriculum || type) && <span className="text-slate-400"> (ตามตัวกรองที่เลือก)</span>}
        </div>
        {notFilled.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700">
            ทุกคนกรอกข้อมูลของเดือนนี้แล้ว 🎉
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-light text-left text-xs font-bold text-slate-700">
                  <th className="px-3 py-2">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2">ประเภท</th>
                  <th className="px-3 py-2">อีเมล</th>
                </tr>
              </thead>
              <tbody>
                {notFilled.map((u) => (
                  <tr key={u.id} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2">
                      {u.title} {u.full_name}
                      {u.employment_type !== "TOR" && u.student_id && (
                        <span className="ml-2 text-xs text-slate-400">{u.student_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`badge ${EMP_BADGE[u.employment_type] || ""}`}>
                        {EMP_LABELS[u.employment_type] || u.employment_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{u.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={!!calFor}
        onClose={() => { setCalFor(null); setSelDay(null); }}
        title={calFor ? `ปฏิทินการลงเวลา — ${calFor.section?.course?.code} ตอน ${calFor.section?.section}` : ""}
      >
        {calFor && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <span>{calFor.name} · {TH_MONTHS[mm - 1]} {yy + 543}</span>
              <span className="text-xs text-slate-400">
                ตามตารางสอน {calSchedHours ? `${calSchedHours} ชม./วัน` : "กรอกเอง (Module)"} · {calRate} ฿/ชม.
              </span>
            </div>
            {calConfirmed && (
              <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                เดือนนี้ยืนยันนำส่งแล้ว — การแก้ไขจะเปลี่ยนยอดจริง/ใช้ไป แต่ยอดเบิกและเอกสารที่ freeze ไว้ตอนยืนยันจะไม่เปลี่ยน
                ให้กด <b>ยกเลิกการยืนยัน</b> ในตารางแล้วยืนยันใหม่หลังแก้เสร็จ
              </div>
            )}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
              {WD_TH.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthMatrix(yy, mm - 1).flat().map((d, i) => {
                if (!d) return <div key={i} />;
                const key = ymd(d);
                const v = calDates[key];
                const has = !!v;
                const sel = selDay === key;
                const manual = has && v.raw != null && v.raw !== "";
                return (
                  <button type="button" key={i}
                    onClick={() => pickDay(d)}
                    title={has ? `${v.hours} ชม.${manual ? " (แก้ไขเอง)" : ""} — คลิกเพื่อแก้ไข` : "คลิกเพื่อเพิ่มวันนี้"}
                    className={`relative flex aspect-square items-center justify-center rounded-lg text-sm transition ${
                      has ? "bg-emerald-500 font-semibold text-white hover:bg-emerald-600" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    } ${sel ? "ring-2 ring-brand ring-offset-1" : ""}`}
                  >
                    {d.getDate()}
                    {has && <span className="absolute bottom-0.5 text-[9px] font-normal">{v.hours}{manual ? "*" : ""}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-emerald-500 inline-block" /> วันที่ลงเวลา · * = ชั่วโมงที่แก้ไขเอง</span>
              <span>รวม {Object.keys(calDates).length} วัน · {Math.round(Object.values(calDates).reduce((a, b) => a + b.hours, 0) * 100) / 100} ชม.</span>
            </div>

            {/* ---- edit panel ---- */}
            {selDay ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-700">
                    {calDates[selDay] ? "แก้ไขวันที่" : "เพิ่มวันที่"} {selDay.split("-").reverse().join("/")}
                  </div>
                  {calDates[selDay] && (
                    <div className="text-xs text-slate-500">
                      ปัจจุบัน {calDates[selDay].hours} ชม. = {thb(Math.round(calDates[selDay].hours * calRate * 100) / 100)} บาท
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-600">
                    จำนวนชั่วโมง
                    <input type="number" step="0.25" min="0" className="input mt-1 w-28" value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)} disabled={calBusy} />
                  </label>
                  <button type="button" className="btn-primary" disabled={calBusy} onClick={() => saveDay("save")}>
                    {calDates[selDay] ? "บันทึกชั่วโมง" : "เพิ่มวันนี้"}
                  </button>
                  {calDates[selDay] && calSchedHours > 0 && calDates[selDay].raw != null && (
                    <button type="button" className="btn-ghost text-sm" disabled={calBusy} onClick={() => saveDay("reset")}
                      title={`กลับไปใช้ ${calSchedHours} ชม. ตามตารางสอน`}>
                      ใช้ตามตารางสอน ({calSchedHours} ชม.)
                    </button>
                  )}
                  {calDates[selDay] && (
                    <button type="button" className="btn-ghost text-sm text-red-600" disabled={calBusy} onClick={() => saveDay("delete")}>
                      ลบวันนี้
                    </button>
                  )}
                  <button type="button" className="btn-ghost text-sm" disabled={calBusy} onClick={() => setSelDay(null)}>ปิด</button>
                </div>
                {calPreview && (
                  <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <div className="font-medium text-slate-500">เดือนนี้ (ปัจจุบัน)</div>
                      {calPreview.cur.days} วัน · {calPreview.cur.hours} ชม. · เงินจริง {thb(calPreview.cur.money)} บาท
                      {calFor.emp === "SCHOLARSHIP" && <> · เบิกได้ {calPreview.cur.conv.hours} ชม. = <b>{thb(calPreview.cur.conv.money)}</b> บาท</>}
                    </div>
                    <div>
                      <div className="font-medium text-brand">หลังบันทึก</div>
                      {calPreview.next.days} วัน · {calPreview.next.hours} ชม. · เงินจริง {thb(calPreview.next.money)} บาท
                      {calFor.emp === "SCHOLARSHIP" && <> · เบิกได้ {calPreview.next.conv.hours} ชม. = <b>{thb(calPreview.next.conv.money)}</b> บาท</>}
                    </div>
                    {(() => {
                      const b = budgetBySection[calFor.section?.id];
                      if (!b || b.budget == null) return null;
                      // b.used = whole-term "ใช้ไป" (converted for ป.ตรี); shift it by this month's change
                      const delta = calFor.emp === "SCHOLARSHIP"
                        ? calPreview.next.conv.money - calPreview.cur.conv.money
                        : calPreview.next.money - calPreview.cur.money;
                      const remain = Math.round((b.budget - b.used - delta) * 100) / 100;
                      return (
                        <div className={`sm:col-span-2 ${remain < 0 ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                          งบวิชา {thb(b.budget)} · ใช้ไปทั้งเทอมหลังบันทึก ≈ {thb(Math.round((b.budget - remain) * 100) / 100)} · คงเหลือ ≈ {thb(remain)} บาท{remain < 0 ? " (เกินงบ!)" : ""}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-400">คลิกวันในปฏิทินเพื่อแก้ชั่วโมง / ลบวัน หรือคลิกวันว่างเพื่อเพิ่มวัน</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent, hint, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      className={`card py-3 ${clickable ? "cursor-pointer transition hover:ring-2 hover:ring-brand/30" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className={`text-2xl font-bold ${accent === "emerald" ? "text-emerald-600" : "text-brand"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}
