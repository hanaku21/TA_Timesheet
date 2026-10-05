"use client";

import { useState, useEffect } from "react";
import AnnouncementManager from "./AnnouncementManager";

// ---- CSV sample templates (columns must match the import parser) ----
const PEOPLE_COLS = [
  "คำนำหน้า", "ชื่อ-นามสกุล", "สถานะการจ้าง", "การรายงานตัว", "รหัสนักศึกษา",
  "เลขที่บัตรประชาชน", "เบอร์โทร", "อีเมล", "ที่อยู่ตามบัตรประชาชน", "ธนาคาร", "เลขที่บัญชี",
];
const PEOPLE_ROWS = [
  ["นาย", "สมชาย ใจดี", "TA/RA", "รายงานตัวแล้ว", "640610001", "1509901234567", "0812345678", "somchai@cmu.ac.th", "123 หมู่ 4 ต.สุเทพ อ.เมือง จ.เชียงใหม่", "ไทยพาณิชย์", "1234567890"],
  ["นางสาว", "สมหญิง เก่งมาก", "ทุนป.ตรี", "", "640610002", "1101700987654", "0898765432", "somying@cmu.ac.th", "45/6 ถ.ห้วยแก้ว ต.ช้างเผือก อ.เมือง จ.เชียงใหม่", "กสิกรไทย", "0987654321"],
  ["นาย", "อดิศร รับเหมา", "TOR (จ้างเหมา)", "", "", "1500700081368", "0801112222", "adisorn@camt.info", "37/9 ซ.4 ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่", "กรุงไทย", "5566778899"],
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

const TOR_COLS = ["เลข TOR", "วันเริ่มงาน", "ระยะเวลา (วัน)", "วันสิ้นสุด", "ยอดสั่งจ้าง", "หมายเหตุ"];
const TOR_ROWS = [
  ["CAMT/1898", "2026-06-22", "135", "2026-11-02", "9000", ""],
  ["CAMT/1903", "2026-06-22", "135", "2026-11-02", "12000", ""],
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
  // signature-footer names/positions for the reimbursement forms
  const [sign, setSign] = useState({
    enabled: false, head: { name: "", position: "" }, approver: { name: "", position: "" },
    f07: { noticeDateGrad: "", noticeDateUg: "", noticeDateTor: "", preparer: "", certifier: "" },
  });
  const [signMsg, setSignMsg] = useState(null);
  const [signSaving, setSignSaving] = useState(false);
  const [terms, setTerms] = useState([]);
  const [term, setTerm] = useState("");
  // TOR contract-period import
  const [torFile, setTorFile] = useState(null);
  const [showTorSample, setShowTorSample] = useState(false);
  const [torLoading, setTorLoading] = useState(false);
  const [torResult, setTorResult] = useState(null);
  const [torErr, setTorErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => {
      if (d && d.scholarship_rate) setCfg({ scholarship_rate: d.scholarship_rate, scholarship_max_hours: d.scholarship_max_hours });
    });
    fetch("/api/admin/terms").then((r) => r.json()).then((d) => {
      const ts = d.terms || [];
      setTerms(ts);
      setTerm((ts.find((t) => t.is_active) || ts[0])?.code || "");
    });
    fetch("/api/admin/signatories").then((r) => r.json()).then((d) => {
      if (d && d.head) setSign({ enabled: !!d.enabled, head: d.head, approver: d.approver, f07: d.f07 || { noticeDateGrad: "", noticeDateUg: "", preparer: "", certifier: "" } });
    });
  }, []);

  async function saveSign(e) {
    e.preventDefault();
    setSignMsg(null);
    setSignSaving(true);
    try {
      const res = await fetch("/api/admin/signatories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sign),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setSignMsg({ type: "ok", text: "บันทึกผู้ลงนามแล้ว" });
    } catch (e2) {
      setSignMsg({ type: "error", text: e2.message });
    } finally {
      setSignSaving(false);
    }
  }

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
    if (!term) {
      setErr("กรุณาเลือกปีการศึกษาที่จะนำเข้า");
      return;
    }
    const fd = new FormData();
    if (people) fd.append("people", people);
    if (ems) fd.append("ems", ems);
    if (term) fd.append("term", term);
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

  async function submitTor(e) {
    e.preventDefault();
    setTorErr("");
    setTorResult(null);
    if (!torFile) { setTorErr("กรุณาเลือกไฟล์ CSV ของ TOR"); return; }
    if (!term) { setTorErr("กรุณาเลือกปีการศึกษาที่จะนำเข้า"); return; }
    const fd = new FormData();
    fd.append("file", torFile);
    fd.append("term", term);
    setTorLoading(true);
    try {
      const res = await fetch("/api/admin/import-tor", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "นำเข้าไม่สำเร็จ");
      setTorResult(d);
    } catch (e2) {
      setTorErr(e2.message);
    } finally {
      setTorLoading(false);
    }
  }

  return (
    <div className="space-y-5">
    {/* Announcement slideshow shown on the TA dashboard */}
    <AnnouncementManager />

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

    {/* Signature footer config (TA/RA · จ้างเหมา forms) */}
    <form onSubmit={saveSign} className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-700">ผู้ลงนามในเอกสาร (ใบเบิก TA/RA · จ้างเหมา)</h3>
          <p className="mt-1 text-sm text-slate-500">
            เติมชื่อ (ในวงเล็บ) และตำแหน่ง ให้ช่อง “หัวหน้าภาควิชาฯ” และ “ผู้อนุมัติ” ในใบเบิก
            ใช้ทั้งฝั่งผู้ช่วยสอนและ admin — ปิดไว้ก่อนได้ (เดือน ส.ค. ยังไม่ใช้)
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={sign.enabled}
          onClick={() => setSign((s) => ({ ...s, enabled: !s.enabled }))}
          title={sign.enabled ? "เปิดใช้งาน — คลิกเพื่อปิด" : "ปิดอยู่ — คลิกเพื่อเปิด"}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${sign.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${sign.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className={`mt-3 grid gap-4 md:grid-cols-2 ${sign.enabled ? "" : "opacity-50"}`}>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า</div>
          <label className="label">ชื่อ (แสดงในวงเล็บ)</label>
          <input className="input" disabled={!sign.enabled} value={sign.head.name}
            onChange={(e) => setSign((s) => ({ ...s, head: { ...s.head, name: e.target.value } }))}
            placeholder="เช่น ผศ.ดร. สมชาย ใจดี" />
          <label className="label mt-2">ตำแหน่ง</label>
          <input className="input" disabled={!sign.enabled} value={sign.head.position}
            onChange={(e) => setSign((s) => ({ ...s, head: { ...s.head, position: e.target.value } }))}
            placeholder="เช่น หัวหน้าสำนักวิชา" />
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">ผู้อนุมัติ</div>
          <label className="label">ชื่อ (แสดงในวงเล็บ)</label>
          <input className="input" disabled={!sign.enabled} value={sign.approver.name}
            onChange={(e) => setSign((s) => ({ ...s, approver: { ...s.approver, name: e.target.value } }))}
            placeholder="เช่น รศ.ดร. สมหญิง เก่งมาก" />
          <label className="label mt-2">ตำแหน่ง</label>
          <input className="input" disabled={!sign.enabled} value={sign.approver.position}
            onChange={(e) => setSign((s) => ({ ...s, approver: { ...s.approver, position: e.target.value } }))}
            placeholder="เช่น คณบดี" />
        </div>
      </div>

      {/* F-07 ใบสรุปเบิก (บัณฑิต / ป.ตรี) header + signatories */}
      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <div className="mb-1 text-sm font-semibold text-slate-700">ใบสรุปเบิก F-07 (จ้างเหมา TOR · บัณฑิต TA/RA · ทุน ป.ตรี)</div>
        <p className="mb-2 text-xs text-slate-500">
          ใช้ในไฟล์ "สรุปค่าใช้จ่าย แยกตามประเภทการจ้าง" — ข้อความ "เบิกเงินตามประกาศรายชื่อ… ลงวันที่" และชื่อผู้จัดทำ/ผู้รับรองท้ายฟอร์ม (ใช้ได้ตลอดไม่ขึ้นกับสวิตช์ด้านบน)
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">ประกาศรายชื่อ บัณฑิตศึกษา ลงวันที่</label>
            <input className="input" value={sign.f07?.noticeDateGrad || ""} placeholder="เช่น 19 มิถุนายน 2569"
              onChange={(e) => setSign((s) => ({ ...s, f07: { ...s.f07, noticeDateGrad: e.target.value } }))} />
          </div>
          <div>
            <label className="label">ประกาศรายชื่อ ปริญญาตรี ลงวันที่</label>
            <input className="input" value={sign.f07?.noticeDateUg || ""} placeholder="เช่น 19 มิถุนายน 2569"
              onChange={(e) => setSign((s) => ({ ...s, f07: { ...s.f07, noticeDateUg: e.target.value } }))} />
          </div>
          <div>
            <label className="label">จ้างเหมา (TOR) — สัญญา ลงวันที่ (เว้นว่างได้)</label>
            <input className="input" value={sign.f07?.noticeDateTor || ""} placeholder="เช่น 22 มิถุนายน 2569"
              onChange={(e) => setSign((s) => ({ ...s, f07: { ...s.f07, noticeDateTor: e.target.value } }))} />
          </div>
          <div>
            <label className="label">ผู้จัดทำ (ชื่อในวงเล็บ)</label>
            <input className="input" value={sign.f07?.preparer || ""} placeholder="เช่น นางมาลีทิพย์ ปลัดคุณ"
              onChange={(e) => setSign((s) => ({ ...s, f07: { ...s.f07, preparer: e.target.value } }))} />
          </div>
          <div>
            <label className="label">ผู้รับรอง (ชื่อในวงเล็บ)</label>
            <input className="input" value={sign.f07?.certifier || ""} placeholder="เช่น ผู้ช่วยศาสตราจารย์ ดร. ..."
              onChange={(e) => setSign((s) => ({ ...s, f07: { ...s.f07, certifier: e.target.value } }))} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={signSaving}>{signSaving ? "กำลังบันทึก..." : "บันทึกผู้ลงนาม"}</button>
        {signMsg && (
          <span className={`text-sm ${signMsg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{signMsg.text}</span>
        )}
      </div>
    </form>

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
          <label className="label">นำเข้าไปยังปีการศึกษา *</label>
          <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
            {terms.length === 0 && <option value="">— ยังไม่มีปีการศึกษา —</option>}
            {terms.map((t) => (
              <option key={t.code} value={t.code}>{t.code}{t.is_active ? " (ใช้งานอยู่)" : ""}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">ข้อมูลวิชา/section/มอบหมายงานจะถูกบันทึกลงปีการศึกษาที่เลือก</p>
        </div>

        <div>
          <label className="label">1) ไฟล์ผู้ช่วยสอน (สร้าง/อัปเดต user)</label>
          <input type="file" accept=".csv" className="input"
            onChange={(e) => setPeople(e.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-slate-400">
            เช่น <code>ผู้ช่วยสอน_2569-1.csv</code> · รหัสผ่าน = เบอร์โทร (ไม่มีเบอร์ = 0123456789) ·
            คอลัมน์ <code>เลขที่บัตรประชาชน</code> และ <code>ที่อยู่ตามบัตรประชาชน</code> ใช้เติมในใบวางบิล/ใบเสร็จของจ้างเหมา
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
          หมายเหตุ: user ที่มีอยู่แล้วจะ <b>ไม่ถูกทับ</b> — ระบบเติมเฉพาะช่องที่ยังว่าง (คำนำหน้า, รหัส นศ., เบอร์โทร, ที่อยู่, เลขบัตร, ธนาคาร)
          และไม่เปลี่ยนรหัสผ่าน · ยกเว้นข้อมูลตามเทอม (ประเภทการจ้าง, เลข TOR, สถานะรายงานตัว) ที่ใช้ค่าจากไฟล์ล่าสุด
        </p>
      </form>

      <div className="card">
        <h3 className="mb-3 font-semibold text-slate-700">ผลการนำเข้า</h3>
        {!result && <p className="text-sm text-slate-400">ยังไม่มีการนำเข้า</p>}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="user ใหม่" value={result.users_new} />
              <Stat label="user เดิม (อัปเดต)" value={result.users_updated} />
              <Stat label="เติมข้อมูลที่ว่าง (คน)" value={result.users_filled} />
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

    {/* TOR contract periods import */}
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submitTor} className="card space-y-4">
        <h3 className="font-semibold text-slate-700">นำเข้าช่วงสัญญา TOR (จ้างเหมา)</h3>
        <p className="text-sm text-slate-500">
          ผูกวันเริ่มงาน–วันสิ้นสุดเข้ากับเลข TOR แต่ละวิชา/section ที่มีเลข TOR ตรงกัน
          จะลง timesheet ได้เฉพาะภายในช่วงวันของสัญญานั้น (อัปเดตซ้ำได้)
        </p>

        <div>
          <label className="label">นำเข้าไปยังปีการศึกษา *</label>
          <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
            {terms.length === 0 && <option value="">— ยังไม่มีปีการศึกษา —</option>}
            {terms.map((t) => (
              <option key={t.code} value={t.code}>{t.code}{t.is_active ? " (ใช้งานอยู่)" : ""}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">ไฟล์ TOR</label>
          <input type="file" accept=".csv" className="input"
            onChange={(e) => setTorFile(e.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-slate-400">
            เช่น <code>TOR_2569-1.csv</code> · เลข TOR ต้องอยู่ในรูปแบบเดียวกับข้อมูลวิชา (เช่น <code>CAMT/1898</code>)
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className="btn-edit"
              onClick={() => downloadCsv("ตัวอย่าง_TOR.csv", TOR_COLS, TOR_ROWS)}>
              ⬇ ดาวน์โหลดไฟล์ตัวอย่าง
            </button>
            <button type="button" className="btn-soft" onClick={() => setShowTorSample((v) => !v)}>
              {showTorSample ? "ซ่อนตัวอย่าง" : "ดูคอลัมน์ + ตัวอย่าง"}
            </button>
          </div>
          {showTorSample && <SamplePreview cols={TOR_COLS} rows={TOR_ROWS} />}
        </div>

        {torErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{torErr}</div>}

        <button className="btn-primary w-full" disabled={torLoading}>
          {torLoading ? "กำลังนำเข้า..." : "นำเข้าช่วงสัญญา TOR"}
        </button>
      </form>

      <div className="card">
        <h3 className="mb-3 font-semibold text-slate-700">ผลการนำเข้า TOR</h3>
        {!torResult && <p className="text-sm text-slate-400">ยังไม่มีการนำเข้า</p>}
        {torResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="TOR ที่นำเข้า" value={torResult.imported} />
              <Stat label="จับคู่ section ได้" value={torResult.matchedSections} />
              <Stat label="ยังไม่มี section ตรงกัน" value={torResult.unmatched} />
              <Stat label="ข้าม (ไม่มีวันที่)" value={torResult.skipped} />
            </div>
            {torResult.unmatched > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                มี {torResult.unmatched} เลข TOR ที่ยังไม่มีวิชา/section ตรงกันในปีการศึกษานี้
                (จะเริ่มมีผลเมื่อ section ที่มีเลข TOR นั้นถูกนำเข้า)
              </div>
            )}
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              นำเข้าเรียบร้อย (ปีการศึกษา {torResult.term})
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
