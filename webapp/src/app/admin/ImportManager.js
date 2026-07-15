"use client";

import { useState, useEffect } from "react";

// ---- CSV sample templates (columns must match the import parser) ----
const PEOPLE_COLS = [
  "คำนำหน้า", "ชื่อ-นามสกุล", "สถานะการจ้าง", "รหัสนักศึกษา", "เบอร์โทร",
  "อีเมล", "การรายงานตัว", "ธนาคาร", "เลขที่บัญชี",
];
const PEOPLE_ROWS = [
  ["นาย", "สมชาย ใจดี", "TA/RA", "640610001", "0812345678", "somchai@cmu.ac.th", "รายงานตัวแล้ว", "ไทยพาณิชย์", "1234567890"],
  ["นางสาว", "สมหญิง เก่งมาก", "ทุนป.ตรี", "640610002", "0898765432", "somying@cmu.ac.th", "", "กสิกรไทย", "0987654321"],
  ["นาย", "อดิศร รับเหมา", "TOR (จ้างเหมา)", "", "0801112222", "adisorn@camt.info", "", "กรุงไทย", "5566778899"],
];

const EMS_COLS = [
  "หลักสูตร", "รหัสวิชา", "ชื่อวิชา", "ตอนที่", "ประเภทการจ้าง", "เลข TOR",
  "ประเภทการสอน", "วันที่สอน", "เวลาเริ่ม", "เวลาจบ", "ผู้สอน",
  "ค่าใช้จ่ายคาดการณ์", "อัตราค่าจ้าง/ชม. (จริง)", "อัตราค่าจ้าง/ชม. (แผน)", "ผู้ช่วยสอน",
];
const EMS_ROWS = [
  ["SE (Bachelor)", "954374", "Software Testing", "001", "TA/RA", "", "LEC", '["Mon","Thu"]', "14:00", "15:30", "อ.สมศักดิ์", "9000", "200", "200", "สมชาย ใจดี"],
  ["ANI", "951106", "Screenwriting", "001", "ทุนป.ตรี", "", "LAB", '["Fri"]', "09:00", "12:00", "อ.สมพร", "12000", "200", "200", "สมหญิง เก่งมาก"],
  ["DG", "953201", "Game Module", "002", "TOR (จ้างเหมา)", "1574", "MODULE", "[]", "", "", "อ.สมคิด", "8000", "300", "300", "อดิศร รับเหมา"],
];

// RFC-4180 CSV escaping + UTF-8 BOM (so Excel opens Thai correctly)
function toCsv(cols, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return "﻿" + lines.join("\r\n");
}
function downloadCsv(filename, cols, rows) {
  const blob = new Blob([toCsv(cols, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SamplePreview({ cols, rows }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-brand-light text-left font-medium text-slate-600">
            {cols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50">
              {r.map((v, j) => <td key={j} className="whitespace-nowrap px-2 py-1 text-slate-500">{v || "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportManager() {
  const [showPeopleSample, setShowPeopleSample] = useState(false);
  const [showEmsSample, setShowEmsSample] = useState(false);
  const [people, setPeople] = useState(null);
  const [ems, setEms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [cfg, setCfg] = useState({ scholarship_rate: 50, scholarship_max_hours: 8 });
  const [cfgMsg, setCfgMsg] = useState(null);
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function resetPasswords() {
    if (pwConfirm !== "RESET") return;
    if (!confirm("รีเซ็ตรหัสผ่านของผู้ใช้ทุกคน (ยกเว้น admin) เป็นเบอร์โทร?")) return;
    setPwMsg(null); setPwBusy(true);
    try {
      const res = await fetch("/api/admin/reset-passwords", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "ไม่สำเร็จ");
      setPwMsg({ type: "ok", text: `รีเซ็ตแล้ว ${d.updated} คน (ใช้ค่าเริ่มต้น 0123456789 เพราะไม่มีเบอร์: ${d.usedDefault} คน)` });
      setPwConfirm("");
    } catch (e2) {
      setPwMsg({ type: "error", text: e2.message });
    } finally {
      setPwBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => {
      if (d && d.scholarship_rate) setCfg({ scholarship_rate: d.scholarship_rate, scholarship_max_hours: d.scholarship_max_hours });
    });
  }, []);

  async function saveCfg(e) {
    e.preventDefault();
    setCfgMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const d = await res.json();
    setCfgMsg(res.ok ? { type: "ok", text: "บันทึกการตั้งค่าแล้ว" } : { type: "error", text: d.error });
  }

  async function doReset() {
    if (confirmText !== "RESET") return;
    if (!confirm("ยืนยันลบข้อมูลทั้งระบบ? การกระทำนี้ย้อนกลับไม่ได้")) return;
    setResetMsg(null);
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "ลบไม่สำเร็จ");
      setResetMsg({ type: "ok", report: d.report });
      setConfirmText("");
    } catch (e2) {
      setResetMsg({ type: "error", text: e2.message });
    } finally {
      setResetting(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setResult(null);
    if (!people && !ems) {
      setErr("กรุณาเลือกอย่างน้อย 1 ไฟล์");
      return;
    }
    const fd = new FormData();
    if (people) fd.append("people", people);
    if (ems) fd.append("ems", ems);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "นำเข้าไม่สำเร็จ");
      setResult(d.report);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
    {/* Scholarship pay config */}
    <form onSubmit={saveCfg} className="card">
      <h3 className="font-semibold text-slate-700">ตั้งค่าการคิดเงินทุน ป.ตรี (ใบเบิก)</h3>
      <p className="mt-1 text-sm text-slate-500">ใช้ตอนออกใบเบิก .xlsx ของนักศึกษาทุน ป.ตรี — แปลงยอดเงินจริงเป็นชั่วโมงที่อัตรานี้ และจำกัดชั่วโมง/วัน</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">อัตรา (บาท/ชั่วโมง)</label>
          <input type="number" min="1" step="0.01" className="input w-40" value={cfg.scholarship_rate}
            onChange={(e) => setCfg({ ...cfg, scholarship_rate: e.target.value })} />
        </div>
        <div>
          <label className="label">เพดานชั่วโมง/วัน</label>
          <input type="number" min="1" step="0.5" className="input w-40" value={cfg.scholarship_max_hours}
            onChange={(e) => setCfg({ ...cfg, scholarship_max_hours: e.target.value })} />
        </div>
        <button className="btn-primary">บันทึกการตั้งค่า</button>
      </div>
      {cfgMsg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${cfgMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {cfgMsg.text}
        </div>
      )}
    </form>

    {/* Reset passwords to phone */}
    <div className="card">
      <h3 className="font-semibold text-slate-700">รีเซ็ตรหัสผ่านผู้ใช้เป็นเบอร์โทร</h3>
      <p className="mt-1 text-sm text-slate-500">
        ตั้งรหัสผ่านของผู้ใช้ทุกคน (ยกเว้น admin) ให้เป็นเบอร์โทรของแต่ละคน — ถ้าใครไม่มีเบอร์จะตั้งเป็น <b>0123456789</b>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">พิมพ์ <b>RESET</b> เพื่อยืนยัน</label>
          <input className="input w-40" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} placeholder="RESET" />
        </div>
        <button className="btn bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          disabled={pwConfirm !== "RESET" || pwBusy} onClick={resetPasswords}>
          {pwBusy ? "กำลังรีเซ็ต..." : "รีเซ็ตรหัสผ่านทั้งหมด"}
        </button>
      </div>
      {pwMsg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${pwMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {pwMsg.text}
        </div>
      )}
    </div>

    {/* Backup */}
    <div className="card">
      <h3 className="font-semibold text-slate-700">สำรองข้อมูล (Backup)</h3>
      <p className="mt-1 text-sm text-slate-500">ดาวน์โหลดข้อมูลทั้งระบบ (ทุกปีการศึกษา) เพื่อเก็บสำรอง</p>
      <div className="mt-3 flex gap-2">
        <a className="btn-ghost" href="/api/admin/backup?format=json">⬇ Backup (.json)</a>
        <a className="btn-ghost" href="/api/admin/backup?format=xlsx">⬇ Backup (.xlsx)</a>
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submit} className="card space-y-4">
        <h3 className="font-semibold text-slate-700">นำเข้าข้อมูลจากไฟล์ CSV</h3>
        <p className="text-sm text-slate-500">
          ใช้ไฟล์รูปแบบเดียวกับที่ส่งมา ระบบจะสร้าง/อัปเดตข้อมูลให้อัตโนมัติ
          (อัปเดตซ้ำได้ ไม่สร้างข้อมูลซ้ำ)
        </p>

        <div>
          <label className="label">1) ไฟล์ผู้ช่วยสอน (สร้าง/อัปเดต user)</label>
          <input type="file" accept=".csv" className="input"
            onChange={(e) => setPeople(e.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-slate-400">
            เช่น <code>ผู้ช่วยสอน_2569-1.csv</code> · รหัสผ่าน = เบอร์โทร (ไม่มีเบอร์ = 0123456789)
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className="btn-edit"
              onClick={() => downloadCsv("ตัวอย่าง_ผู้ช่วยสอน.csv", PEOPLE_COLS, PEOPLE_ROWS)}>
              ⬇ ดาวน์โหลดไฟล์ตัวอย่าง
            </button>
            <button type="button" className="btn-soft"
              onClick={() => setShowPeopleSample((v) => !v)}>
              {showPeopleSample ? "ซ่อนตัวอย่าง" : "ดูคอลัมน์ + ตัวอย่าง"}
            </button>
          </div>
          {showPeopleSample && <SamplePreview cols={PEOPLE_COLS} rows={PEOPLE_ROWS} />}
        </div>

        <div>
          <label className="label">2) ไฟล์วิชา/EMS (สร้างวิชา + section + มอบหมายงาน)</label>
          <input type="file" accept=".csv" className="input"
            onChange={(e) => setEms(e.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-slate-400">
            เช่น <code>EMS_2569-1.csv</code> · ควรอัปโหลดคู่กับไฟล์ผู้ช่วยสอนเพื่อให้จับคู่ TA ได้ครบ
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className="btn-edit"
              onClick={() => downloadCsv("ตัวอย่าง_EMS.csv", EMS_COLS, EMS_ROWS)}>
              ⬇ ดาวน์โหลดไฟล์ตัวอย่าง
            </button>
            <button type="button" className="btn-soft"
              onClick={() => setShowEmsSample((v) => !v)}>
              {showEmsSample ? "ซ่อนตัวอย่าง" : "ดูคอลัมน์ + ตัวอย่าง"}
            </button>
          </div>
          {showEmsSample && <SamplePreview cols={EMS_COLS} rows={EMS_ROWS} />}
          <p className="mt-1.5 text-xs text-slate-400">
            หมายเหตุ: ช่อง <code>วันที่สอน</code> เป็นรูปแบบ JSON เช่น <code>[&quot;Mon&quot;,&quot;Thu&quot;]</code> · <code>สถานะการจ้าง</code>/<code>ประเภทการจ้าง</code> ใช้ค่า: TOR (จ้างเหมา), ทุนป.ตรี, TA/RA
          </p>
        </div>

        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
        </button>
        <p className="text-xs text-slate-400">
          หมายเหตุ: การอัปเดต user เดิมจะไม่เปลี่ยนรหัสผ่านที่มีอยู่
        </p>
      </form>

      <div className="card">
        <h3 className="mb-3 font-semibold text-slate-700">ผลการนำเข้า</h3>
        {!result && <p className="text-sm text-slate-400">ยังไม่มีการนำเข้า</p>}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="user ใหม่" value={result.users_new} />
              <Stat label="user อัปเดต" value={result.users_updated} />
              <Stat label="ปิดใช้งาน (ไม่อยู่ในไฟล์)" value={result.users_deactivated} />
              <Stat label="วิชา" value={result.courses} />
              <Stat label="section" value={result.sections} />
              <Stat label="มอบหมายงาน (TA)" value={result.assignments} />
            </div>
            {result.warnings?.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3">
                <div className="mb-1 text-sm font-medium text-amber-700">
                  คำเตือน ({result.warnings.length})
                </div>
                <ul className="space-y-0.5 text-xs text-amber-700">
                  {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              นำเข้าเรียบร้อย
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Danger zone: full system reset */}
      <div className="card border-2 border-red-200 bg-red-50/40">
        <h3 className="font-semibold text-red-700">ลบข้อมูล / รีเซ็ตระบบ</h3>
        <p className="mt-1 text-sm text-slate-600">
          ลบข้อมูลทั้งหมด: ผู้ใช้ทุกคน (ยกเว้นผู้ดูแล), วิชา, section, การมอบหมายงาน และ timesheet ทั้งหมด
          <br />
          <span className="font-medium text-red-600">การกระทำนี้ย้อนกลับไม่ได้</span> — หลักสูตร, การตั้งค่า และบัญชีผู้ดูแลจะยังอยู่
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">พิมพ์ <b>RESET</b> เพื่อยืนยัน</label>
            <input
              className="input w-48"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
            />
          </div>
          <button
            className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            disabled={confirmText !== "RESET" || resetting}
            onClick={doReset}
          >
            {resetting ? "กำลังลบ..." : "ลบข้อมูลทั้งระบบ"}
          </button>
        </div>
        {resetMsg?.type === "error" && (
          <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{resetMsg.text}</div>
        )}
        {resetMsg?.type === "ok" && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ลบเรียบร้อย — timesheet {resetMsg.report.timesheet}, มอบหมายงาน {resetMsg.report.assignments},
            section {resetMsg.report.sections}, วิชา {resetMsg.report.courses}, user {resetMsg.report.users}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2 text-center">
      <div className="text-xl font-bold text-brand">{value ?? 0}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
