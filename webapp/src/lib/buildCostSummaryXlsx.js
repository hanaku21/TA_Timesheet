import ExcelJS from "exceljs";
import { EMP_LABELS, TH_MONTHS } from "@/lib/constants";
import { entryHours, entryCost } from "@/lib/calc";
import { addF07Sheet } from "@/lib/buildF07Xlsx";

// สรุปค่าใช้จ่ายผู้ช่วยสอน แยกตามประเภทการจ้าง (admin download, one month).
//   Sheet "สรุปรวม"        — totals per employment type (+ per curriculum × type)
//   Sheets "F-07 จ้างเหมา (TOR)" (one block per TOR number), "F-07 บัณฑิต (TA-RA)" and
//   "F-07 ป.ตรี" (one block per student) — the office's F-07 หลักฐานการจ่ายฯ form (buildF07Xlsx.js)
//
// rows:        timesheet entries joined with user + section (same shape as /api/admin/timesheets)
// converted:   { "uid|sid": { hours, money } } scholarship conversion (50 ฿/hr), optional
// confirmed:   Set of "uid|sid" that are confirmed for the month
// filters:     { curriculumLabel, typeLabel } for the header line (optional)

const TYPE_ORDER = ["TOR", "SCHOLARSHIP", "TA_RA"];
const round2 = (n) => Math.round(n * 100) / 100;

const thin = { style: "thin", color: { argb: "FF999999" } };
const allBorder = { top: thin, left: thin, bottom: thin, right: thin };
const headFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
const subFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
const totFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

function styleHeader(row, n) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = headFill;
    c.border = allBorder;
  }
  row.height = 30;
}
function styleCells(row, n, { fill, bold } = {}) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.border = allBorder;
    c.font = { size: 11, bold: !!bold };
    if (fill) c.fill = fill;
  }
}
const money = (c) => { c.numFmt = "#,##0.00"; c.alignment = { horizontal: "right" }; };
const center = (c) => { c.alignment = { horizontal: "center" }; };

// Aggregate entries into per-(user, section) units.
export function aggregateUnits(rows, converted = {}, confirmed = new Set(), budgets = {}) {
  const m = new Map();
  for (const r of rows || []) {
    if (!r.user || !r.section) continue;
    const key = `${r.user.id}|${r.section.id}`;
    if (!m.has(key)) {
      m.set(key, {
        key, user: r.user, section: r.section,
        emp: r.user.employment_type, days: 0, hours: 0, cost: 0,
      });
    }
    const u = m.get(key);
    u.days += 1;
    u.hours = round2(u.hours + entryHours(r.section, r));
    u.cost = round2(u.cost + entryCost(r.section, r));
  }
  const out = [...m.values()].map((u) => {
    const conv = u.emp === "SCHOLARSHIP" ? converted[u.key] || null : null;
    const b = budgets[u.section.id] || {};
    return {
      ...u,
      convHours: conv ? conv.hours : null,
      convMoney: conv ? conv.money : null,
      confirmed: confirmed.has(u.key),
      budget: b.budget ?? null,          // expected_cost of the section (whole term)
      usedTerm: b.used ?? null,          // cost logged over the whole term
      remaining: b.remaining ?? null,    // budget - usedTerm
    };
  });
  out.sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.emp) - TYPE_ORDER.indexOf(b.emp) ||
      (a.user.full_name || "").localeCompare(b.user.full_name || "", "th") ||
      (a.section.course?.code || "").localeCompare(b.section.course?.code || "") ||
      (a.section.section || "").localeCompare(b.section.section || "")
  );
  return out;
}

function summarize(units) {
  const byType = {};
  for (const t of TYPE_ORDER) {
    byType[t] = { people: new Set(), units: 0, confirmed: 0, days: 0, hours: 0, cost: 0, convHours: 0, convMoney: 0, budget: 0, usedTerm: 0, remaining: 0 };
  }
  for (const u of units) {
    const s = byType[u.emp] || (byType[u.emp] = { people: new Set(), units: 0, confirmed: 0, days: 0, hours: 0, cost: 0, convHours: 0, convMoney: 0, budget: 0, usedTerm: 0, remaining: 0 });
    if (u.budget != null) {
      s.budget = round2(s.budget + u.budget);
      s.usedTerm = round2(s.usedTerm + (u.usedTerm || 0));
      s.remaining = round2(s.remaining + (u.remaining || 0));
    }
    s.people.add(u.user.id);
    s.units += 1;
    if (u.confirmed) s.confirmed += 1;
    s.days += u.days;
    s.hours = round2(s.hours + u.hours);
    s.cost = round2(s.cost + u.cost);
    if (u.convHours != null) {
      s.convHours = round2(s.convHours + u.convHours);
      s.convMoney = round2(s.convMoney + u.convMoney);
    }
  }
  return byType;
}

export async function buildCostSummaryWorkbook({ rows, converted, confirmed, budgets, term, month, scholarshipRate = 50, filters = {}, f07 = {} }) {
  const units = aggregateUnits(rows, converted || {}, confirmed || new Set(), budgets || {});
  const byType = summarize(units);
  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear() + 543}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";

  // ======================= Sheet 1: สรุป =======================
  const ws = wb.addWorksheet("สรุปรวม", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });
  ws.columns = [22, 11, 16, 11, 12, 18, 16, 18, 16, 16, 16].map((w) => ({ width: w }));
  const N1 = 11;

  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = "สรุปค่าใช้จ่ายผู้ช่วยสอน แยกตามประเภทการจ้าง (เฉพาะที่ยืนยันนำส่งแล้ว)";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = `วิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ · ภาคการศึกษา ${term} · ประจำเดือน ${monthLabel}`;
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells("A3:K3");
  const fl = [];
  fl.push(`หลักสูตร: ${filters.curriculumLabel || "ทั้งหมด"}`);
  fl.push(`ประเภทการจ้าง: ${filters.typeLabel || "ทั้งหมด"}`);
  fl.push(`ออกรายงาน ${stamp}`);
  ws.getCell("A3").value = fl.join("   ·   ");
  ws.getCell("A3").font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
  ws.getCell("A3").alignment = { horizontal: "center" };

  const H1 = 5;
  const h1 = ws.getRow(H1);
  ["ประเภทการจ้าง", "จำนวนคน", "วิชา/ตอน (ยืนยันแล้ว)", "จำนวนวัน", "ชั่วโมงรวม",
    "ยอดเงินตามอัตราจริง (บาท)", `ชม. เบิกได้ (ทุน ${scholarshipRate}฿)`, "ยอดเบิกทุน ป.ตรี (บาท)",
    "งบเต็ม (ทั้งเทอม)", "ใช้ไปทั้งเทอม (บาท)", "งบคงเหลือ (บาท)"]
    .forEach((h, i) => (h1.getCell(i + 1).value = h));
  styleHeader(h1, N1);

  let r = H1 + 1;
  const grand = { people: new Set(), units: 0, confirmed: 0, days: 0, hours: 0, cost: 0, convHours: 0, convMoney: 0 };
  for (const t of TYPE_ORDER) {
    const s = byType[t];
    const row = ws.getRow(r);
    row.getCell(1).value = EMP_LABELS[t] || t;
    row.getCell(2).value = s.people.size;
    row.getCell(3).value = s.units;
    row.getCell(4).value = s.days;
    row.getCell(5).value = s.hours;
    row.getCell(6).value = s.cost;
    row.getCell(7).value = t === "SCHOLARSHIP" ? s.convHours : "—";
    row.getCell(8).value = t === "SCHOLARSHIP" ? s.convMoney : "—";
    row.getCell(9).value = s.budget;
    row.getCell(10).value = s.usedTerm;
    row.getCell(11).value = s.remaining;
    styleCells(row, N1);
    [2, 3, 4, 5].forEach((i) => center(row.getCell(i)));
    money(row.getCell(6)); money(row.getCell(9)); money(row.getCell(10)); money(row.getCell(11));
    if (t === "SCHOLARSHIP") { center(row.getCell(7)); money(row.getCell(8)); } else { center(row.getCell(7)); center(row.getCell(8)); }
    s.people.forEach((p) => grand.people.add(p));
    grand.units += s.units; grand.confirmed += s.confirmed; grand.days += s.days;
    grand.hours = round2(grand.hours + s.hours); grand.cost = round2(grand.cost + s.cost);
    grand.convHours = round2(grand.convHours + s.convHours); grand.convMoney = round2(grand.convMoney + s.convMoney);
    grand.budget = round2((grand.budget || 0) + s.budget); grand.usedTerm = round2((grand.usedTerm || 0) + s.usedTerm); grand.remaining = round2((grand.remaining || 0) + s.remaining);
    r++;
  }
  {
    const row = ws.getRow(r);
    row.getCell(1).value = "รวมทั้งหมด";
    row.getCell(2).value = grand.people.size;
    row.getCell(3).value = grand.units;
    row.getCell(4).value = grand.days;
    row.getCell(5).value = grand.hours;
    row.getCell(6).value = grand.cost;
    row.getCell(7).value = grand.convHours;
    row.getCell(8).value = grand.convMoney;
    row.getCell(9).value = grand.budget || 0;
    row.getCell(10).value = grand.usedTerm || 0;
    row.getCell(11).value = grand.remaining || 0;
    styleCells(row, N1, { fill: totFill, bold: true });
    [2, 3, 4, 5, 7].forEach((i) => center(row.getCell(i)));
    money(row.getCell(6)); money(row.getCell(8)); money(row.getCell(9)); money(row.getCell(10)); money(row.getCell(11));
    r += 2;
  }

  ws.mergeCells(`A${r}:K${r}`);
  ws.getCell(`A${r}`).value =
    `หมายเหตุ: รวมเฉพาะวิชา/ตอนที่กด "ยืนยันนำส่ง" ของเดือนนี้แล้วเท่านั้น ·  "ยอดเงินตามอัตราจริง" = ชั่วโมง × อัตราค่าจ้าง/ชม. ของ section · ` +
    `สำหรับทุน ป.ตรี ยอดที่เบิกจริงคือ "ยอดเบิกทุน ป.ตรี" (แปลงเป็นชั่วโมงที่ ${scholarshipRate} บาท/ชม. ปัดเป็น 0.5 ชม.) · ` +
    `"งบเต็ม / ใช้ไปทั้งเทอม / งบคงเหลือ" คิดจากค่าใช้จ่ายคาดการณ์ของ section เทียบกับยอดที่ลงเวลาแล้วทั้งปีการศึกษา (ไม่ใช่เฉพาะเดือนนี้)`;
  ws.getCell(`A${r}`).font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
  ws.getCell(`A${r}`).alignment = { wrapText: true };
  ws.getRow(r).height = 30;
  r += 2;

  // ---- สรุปตามหลักสูตร × ประเภท (ยอดเงิน) ----
  ws.mergeCells(`A${r}:K${r}`);
  ws.getCell(`A${r}`).value = "ยอดเงินแยกตามหลักสูตร × ประเภทการจ้าง (บาท)";
  ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  const h2 = ws.getRow(r);
  ["หลักสูตร", "จำนวนคน", EMP_LABELS.TOR, EMP_LABELS.SCHOLARSHIP, EMP_LABELS.TA_RA, "รวม (บาท)"]
    .forEach((h, i) => (h2.getCell(i + 1).value = h));
  styleHeader(h2, 6);
  r++;
  const byCur = new Map();
  for (const u of units) {
    const code = u.section.curriculum?.code || "—";
    if (!byCur.has(code)) byCur.set(code, { people: new Set(), TOR: 0, SCHOLARSHIP: 0, TA_RA: 0 });
    const c = byCur.get(code);
    c.people.add(u.user.id);
    // use the claimable amount for scholarship when available
    const amt = u.emp === "SCHOLARSHIP" && u.convMoney != null ? u.convMoney : u.cost;
    c[u.emp] = round2((c[u.emp] || 0) + amt);
  }
  const curTot = { TOR: 0, SCHOLARSHIP: 0, TA_RA: 0 };
  for (const code of [...byCur.keys()].sort()) {
    const c = byCur.get(code);
    const row = ws.getRow(r);
    row.getCell(1).value = code;
    row.getCell(2).value = c.people.size;
    row.getCell(3).value = c.TOR;
    row.getCell(4).value = c.SCHOLARSHIP;
    row.getCell(5).value = c.TA_RA;
    row.getCell(6).value = round2(c.TOR + c.SCHOLARSHIP + c.TA_RA);
    styleCells(row, 6);
    center(row.getCell(2));
    [3, 4, 5, 6].forEach((i) => money(row.getCell(i)));
    for (const t of TYPE_ORDER) curTot[t] = round2(curTot[t] + c[t]);
    r++;
  }
  {
    const row = ws.getRow(r);
    row.getCell(1).value = "รวม";
    row.getCell(2).value = grand.people.size;
    row.getCell(3).value = curTot.TOR;
    row.getCell(4).value = curTot.SCHOLARSHIP;
    row.getCell(5).value = curTot.TA_RA;
    row.getCell(6).value = round2(curTot.TOR + curTot.SCHOLARSHIP + curTot.TA_RA);
    styleCells(row, 6, { fill: totFill, bold: true });
    center(row.getCell(2));
    [3, 4, 5, 6].forEach((i) => money(row.getCell(i)));
  }

  // ================= One sheet per employment type =================
  const SHEET_NAMES = { TOR: "TOR (จ้างเหมา)", SCHOLARSHIP: "ทุน ป.ตรี", TA_RA: "TA-RA" };
  const cols = [
    { h: "ลำดับ", w: 7 }, { h: "ชื่อ-นามสกุล", w: 28 }, { h: "รหัส นศ. / เลข TOR", w: 16 },
    { h: "อีเมล", w: 30 }, { h: "หลักสูตร", w: 12 }, { h: "รหัสวิชา", w: 10 }, { h: "ชื่อวิชา", w: 36 },
    { h: "ตอน", w: 7 }, { h: "ประเภทสอน", w: 10 }, { h: "จำนวนวัน", w: 9 }, { h: "ชั่วโมง", w: 9 },
    { h: "อัตรา/ชม.", w: 10 }, { h: "ยอดเงิน (บาท)", w: 14 },
    { h: "งบเต็ม (ทั้งเทอม)", w: 14 }, { h: "ใช้ไปทั้งเทอม", w: 14 }, { h: "งบคงเหลือ", w: 14 },
  ];
  const schCols = [{ h: `ชม. เบิกได้ (${scholarshipRate}฿)`, w: 13 }, { h: "ยอดเบิก (บาท)", w: 14 }];

  // sheet order as in the office workbook: TOR, then F-07 บัณฑิต, then F-07 ป.ตรี
  for (const t of ["TOR", "TA_RA", "SCHOLARSHIP"]) {
    const list = units.filter((u) => u.emp === t);
    // TA/RA (บัณฑิต) and ทุน ป.ตรี use the office's F-07 form; TOR keeps the detail sheet.
    if (t === "TOR") { addF07Sheet(wb, { level: "tor", units: list, month, term, scholarshipRate, f07, sheetName: "F-07 จ้างเหมา (TOR)" }); continue; }
    if (t === "TA_RA") { addF07Sheet(wb, { level: "grad", units: list, month, term, scholarshipRate, f07, sheetName: "F-07 บัณฑิต (TA-RA)" }); continue; }
    if (t === "SCHOLARSHIP") { addF07Sheet(wb, { level: "ug", units: list, month, term, scholarshipRate, f07, sheetName: "F-07 ป.ตรี" }); continue; }
    const isSch = t === "SCHOLARSHIP";
    const tcols = isSch ? [...cols, ...schCols] : cols;
    const N = tcols.length;
    const lastCol = String.fromCharCode(64 + N);
    const wd = wb.addWorksheet(SHEET_NAMES[t], {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ showGridLines: false }],
    });
    wd.columns = tcols.map((c) => ({ width: c.w }));

    // ---- title ----
    wd.mergeCells(`A1:${lastCol}1`);
    wd.getCell("A1").value = `สรุปค่าใช้จ่ายผู้ช่วยสอน — ${EMP_LABELS[t]} (เฉพาะที่ยืนยันนำส่งแล้ว)`;
    wd.getCell("A1").font = { bold: true, size: 15 };
    wd.getCell("A1").alignment = { horizontal: "center" };
    wd.getRow(1).height = 24;
    wd.mergeCells(`A2:${lastCol}2`);
    wd.getCell("A2").value = `ภาคการศึกษา ${term} · ประจำเดือน ${monthLabel}` +
      (filters.curriculumLabel ? ` · หลักสูตร ${filters.curriculumLabel}` : "") + ` · ออกรายงาน ${stamp}`;
    wd.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
    wd.getCell("A2").alignment = { horizontal: "center" };

    // ---- summary box for this type ----
    const s = byType[t];
    const box = [
      ["จำนวนคน", s.people.size],
      ["วิชา/ตอน (ยืนยันแล้ว)", s.units],
      ["จำนวนวัน", s.days],
      ["ชั่วโมงรวม", s.hours],
      ["ยอดเงินตามอัตราจริง (บาท)", s.cost],
    ];
    if (isSch) box.push([`ชม. เบิกได้ (${scholarshipRate}฿)`, s.convHours], ["ยอดเบิกจริง (บาท)", s.convMoney]);
    box.push(["งบเต็มรวม (บาท)", s.budget], ["ใช้ไปทั้งเทอม (บาท)", s.usedTerm], ["งบคงเหลือ (บาท)", s.remaining]);
    const bh = wd.getRow(4);
    box.forEach(([h], i) => (bh.getCell(i + 1).value = h));
    styleHeader(bh, box.length);
    const bv = wd.getRow(5);
    box.forEach(([, v], i) => (bv.getCell(i + 1).value = v));
    styleCells(bv, box.length, { bold: true });
    box.forEach(([h], i) => (h.includes("บาท") ? money(bv.getCell(i + 1)) : center(bv.getCell(i + 1))));
    bv.height = 20;

    // ---- per-person table ----
    const H = 7;
    const hd = wd.getRow(H);
    tcols.forEach((c, i) => (hd.getCell(i + 1).value = c.h));
    styleHeader(hd, N);
    wd.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: N } };
    wd.views = [{ showGridLines: false, state: "frozen", ySplit: H }];

    let d = H + 1;
    list.forEach((u, idx) => {
      const row = wd.getRow(d);
      const vals = [
        idx + 1,
        `${u.user.title || ""}${u.user.full_name}`.trim(),
        t === "TOR" ? (u.section.tor_number || u.user.tor_number || "") : (u.user.student_id || ""),
        u.user.email || "",
        u.section.curriculum?.code || "",
        u.section.course?.code || "",
        u.section.course?.name || "",
        u.section.section || "",
        u.section.teaching_type || "",
        u.days,
        u.hours,
        Number(String(u.section.rate ?? "").replace(/[^\d.]/g, "")) || 0,
        u.cost,
        u.budget ?? "",
        u.usedTerm ?? "",
        u.remaining ?? "",
      ];
      if (isSch) vals.push(u.convHours ?? "", u.convMoney ?? "");
      vals.forEach((v, i) => (row.getCell(i + 1).value = v));
      styleCells(row, N);
      [1, 5, 6, 8, 9, 10, 11].forEach((i) => center(row.getCell(i)));
      money(row.getCell(12)); money(row.getCell(13)); money(row.getCell(14)); money(row.getCell(15)); money(row.getCell(16));
      if (u.remaining != null && u.remaining < -1e-6) row.getCell(16).font = { size: 11, bold: true, color: { argb: "FFDC2626" } };
      if (isSch) { center(row.getCell(17)); money(row.getCell(18)); }
      d++;
    });
    if (list.length === 0) {
      wd.mergeCells(`A${d}:${lastCol}${d}`);
      wd.getCell(`A${d}`).value = "— ไม่มีรายการที่ยืนยันนำส่งของประเภทนี้ในเดือนนี้ —";
      wd.getCell(`A${d}`).alignment = { horizontal: "center" };
      wd.getCell(`A${d}`).font = { italic: true, color: { argb: "FF6B7280" } };
      d++;
    }
    // total row
    const tr = wd.getRow(d);
    wd.mergeCells(`A${d}:I${d}`);
    tr.getCell(1).value = `รวม ${EMP_LABELS[t]} — ${s.people.size} คน · ${s.units} วิชา/ตอน`;
    tr.getCell(1).alignment = { horizontal: "right" };
    tr.getCell(10).value = s.days;
    tr.getCell(11).value = s.hours;
    tr.getCell(13).value = s.cost;
    tr.getCell(14).value = s.budget;
    tr.getCell(15).value = s.usedTerm;
    tr.getCell(16).value = s.remaining;
    if (isSch) { tr.getCell(17).value = s.convHours; tr.getCell(18).value = s.convMoney; }
    styleCells(tr, N, { fill: totFill, bold: true });
    tr.getCell(1).alignment = { horizontal: "right" };
    [10, 11].forEach((i) => center(tr.getCell(i)));
    money(tr.getCell(13)); money(tr.getCell(14)); money(tr.getCell(15)); money(tr.getCell(16));
    if (isSch) { center(tr.getCell(17)); money(tr.getCell(18)); }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
