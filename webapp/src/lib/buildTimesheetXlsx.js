import ExcelJS from "exceljs";
import { hoursPerDay, toRate, entryHours } from "@/lib/calc";
import { EMP_LABELS, TH_MONTHS } from "@/lib/constants";

// Default disbursement config for ทุน ป.ตรี (scholarship). Admin can override
// these in settings (scholarship_rate / scholarship_max_hours).
export const SCHOLARSHIP_RATE = 50;
export const MAX_HOURS_PER_DAY = 8;
const round2 = (n) => Math.round(n * 100) / 100;

// Timezone-safe date arithmetic (works regardless of server TZ, e.g. UTC+7).
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Is this date inside a blackout period that applies to the given curriculum?
// blackouts: [{ start_date, end_date, curriculum_ids: [] }] (empty ids = all)
function isBlackout(dateStr, curriculumId, blackouts) {
  return (blackouts || []).some((b) => {
    if (dateStr < b.start_date || dateStr > b.end_date) return false;
    const ids = b.curriculum_ids || [];
    return ids.length === 0 || ids.includes(curriculumId);
  });
}

// Enumerate every calendar day (YYYY-MM-DD) in [start, end] inclusive.
function enumerateDays(start, end) {
  const days = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard < 1000) {
    days.push(d);
    d = addDays(d, 1);
    guard++;
  }
  return days;
}

// Whole-day difference between two YYYY-MM-DD strings.
function dayDiff(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.abs(Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000));
}

// Order all month days by distance to the nearest worked day, then chronologically.
// -> worked days first (in date order), then their nearest neighbours outward.
function candidateOrder(allDays, workedDates) {
  return allDays
    .map((d) => ({
      d,
      dist: workedDates.reduce((m, w) => Math.min(m, dayDiff(d, w)), Infinity),
    }))
    .sort((x, y) => x.dist - y.dist || x.d.localeCompare(y.d))
    .map((x) => x.d);
}

// Build display rows. For most users this is 1 row per entry at the actual rate.
// For SCHOLARSHIP: convert each entry's money to hours at 50 ฿/hr, POOL the billed
// hours per course, then lay them out so each day is filled to 8 hr — worked days
// first, spilling any remainder to the nearest claimable day (before or after),
// skipping blackouts. One day belongs to a single course (no mixing).
function buildDisplayRows(user, rows, monthStart, monthEnd, blackouts, cfg) {
  const RATE = cfg?.rate || SCHOLARSHIP_RATE;
  const MAXH = cfg?.maxHours || MAX_HOURS_PER_DAY;
  const base = rows
    .slice()
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || (a.id || 0) - (b.id || 0))
    .map((e) => {
      const sec = e.section || {};
      const h = entryHours(sec, e); // manual hours for MODULE, else from section time
      const rate = toRate(sec.rate);
      return { sec, work_date: e.work_date, hours: h, rate, money: round2(h * rate), remark: e.remark || "" };
    });

  if (user.employment_type !== "SCHOLARSHIP") {
    return base.map((b) => ({
      section: b.sec, work_date: b.work_date, hours: b.hours, rate: b.rate, money: b.money, remark: b.remark,
    }));
  }

  // ---- pool billed hours per course/section ----
  const groups = new Map(); // sid -> { section, pool, dates:[] }
  for (const b of base) {
    const sid = b.sec.id ?? `${b.sec.course?.code || ""}|${b.sec.section || ""}`;
    if (!groups.has(sid)) groups.set(sid, { section: b.sec, pool: 0, dates: [] });
    const g = groups.get(sid);
    g.pool = round2(g.pool + round2(b.money / RATE));
    g.dates.push(b.work_date);
  }

  // process courses by earliest worked date (deterministic; earlier course claims days first)
  const sections = [...groups.entries()]
    .map(([sid, g]) => ({ sid, section: g.section, pool: g.pool, worked: [...new Set(g.dates)].sort() }))
    .sort((a, b) => (a.worked[0] || "").localeCompare(b.worked[0] || "") || String(a.sid).localeCompare(String(b.sid)));

  const allDays = enumerateDays(monthStart, monthEnd);
  const dayHours = {}; // date -> hours allocated (global 8/day cap)
  const dayOwner = {}; // date -> sid (one course per day)
  const out = [];

  for (const S of sections) {
    let pool = S.pool;
    if (pool <= 0.0001) continue;
    const curId = S.section.curriculum_id;

    for (const d of candidateOrder(allDays, S.worked)) {
      if (pool <= 0.0001) break;
      if (isBlackout(d, curId, blackouts)) continue;
      if (dayOwner[d] && dayOwner[d] !== S.sid) continue; // 1 day = 1 course
      const room = round2(MAXH - (dayHours[d] || 0));
      if (room <= 0.0001) continue;
      const take = round2(Math.min(room, pool));
      dayHours[d] = round2((dayHours[d] || 0) + take);
      dayOwner[d] = S.sid;
      pool = round2(pool - take);
      out.push({ section: S.section, work_date: d, hours: take, rate: RATE, money: round2(take * RATE), remark: "" });
    }

    // safety net: no claimable room left in the month — keep the money correct
    if (pool > 0.0001) {
      const d = S.worked[S.worked.length - 1] || monthEnd;
      out.push({
        section: S.section, work_date: d, hours: round2(pool),
        rate: RATE, money: round2(pool * RATE), remark: "(เกินโควตาเดือน)",
      });
    }
  }

  out.sort((a, b) => a.work_date.localeCompare(b.work_date));
  return out;
}

// Build a monthly reimbursement-form workbook for one user.
// rows: array of timesheet entries, each with a joined `section`.
// Compute the redistributed display rows for ONE user across ALL their sections
// (shared 8hr/day cap so days don't collide between sections). Returns rows each
// carrying their `section`, so callers can split per section afterwards.
export function computeDisplayRows({ user, rows, month, blackouts = [], payConfig }) {
  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const RATE = payConfig?.rate || SCHOLARSHIP_RATE;
  const MAXH = payConfig?.maxHours || MAX_HOURS_PER_DAY;
  return buildDisplayRows(user, rows, monthStart, monthEnd, blackouts, { rate: RATE, maxHours: MAXH });
}

export async function buildTimesheetWorkbook({ user, rows, month, blackouts = [], payConfig, displayRows: preRows }) {
  const RATE = payConfig?.rate || SCHOLARSHIP_RATE;
  const MAXH = payConfig?.maxHours || MAX_HOURS_PER_DAY;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  const ws = wb.addWorksheet("ใบเบิก", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  // Columns: ลำดับ, รหัสวิชา, Section, หลักสูตร, ชื่อ-นามสกุล, วันที่,
  //          ชั่วโมง, เงิน/ชม., รวมเป็นเงิน, หมายเหตุ, ลายเซ็น
  const widths = [6, 12, 10, 12, 26, 13, 10, 12, 14, 22, 22];
  ws.columns = widths.map((w) => ({ width: w }));
  const LAST = "K";

  const thin = { style: "thin", color: { argb: "FF999999" } };
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin };

  // ---- Title (depends on employment type) ----
  // TOR (จ้างเหมา) -> งานจ้างเหมา ; นักศึกษา (ทุน ป.ตรี / TA-RA) -> ทุนนักศึกษา
  const title =
    user.employment_type === "TOR"
      ? "แบบใบเบิกค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน"
      : "แบบใบเบิกค่าตอบแทนทุนนักศึกษาผู้ช่วยสอน";
  ws.mergeCells(`A1:${LAST}1`);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 16 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${LAST}2`);
  const s2 = ws.getCell("A2");
  s2.value = `ภาคการศึกษา 2569/1   ประจำเดือน ${monthLabel}`;
  s2.font = { size: 12 };
  s2.alignment = { horizontal: "center" };

  // ---- Person info ----
  ws.mergeCells("A4:E4");
  ws.getCell("A4").value = `ชื่อ-นามสกุล: ${user.title || ""} ${user.full_name}`;
  ws.mergeCells("F4:K4");
  ws.getCell("F4").value =
    `ประเภทการจ้าง: ${EMP_LABELS[user.employment_type] || user.employment_type}` +
    (user.tor_number ? `   เลข TOR: ${user.tor_number}` : "") +
    (user.student_id ? `   รหัสนักศึกษา: ${user.student_id}` : "");
  ws.getCell("A4").font = ws.getCell("F4").font = { size: 11 };

  // ---- Note for scholarship conversion ----
  if (user.employment_type === "SCHOLARSHIP") {
    ws.mergeCells("A5:K5");
    const note = ws.getCell("A5");
    note.value =
      `หมายเหตุ: คิดค่าตอบแทนที่อัตรา ${RATE} บาท/ชั่วโมง (แปลงจากยอดเงินจริงต่อวัน) ไม่เกิน ${MAXH} ชั่วโมง/วัน ส่วนที่เกินทบไปวันถัดไป`;
    note.font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
  }

  // ---- Table header ----
  const headerRowIdx = 6;
  const headers = [
    "ลำดับ", "รหัสวิชา", "Section", "หลักสูตร", "ชื่อ-นามสกุล", "วันที่",
    "จำนวนชั่วโมง", "เงิน/ชม. (บาท)", "รวมเป็นเงิน (บาท)", "หมายเหตุ", "ลายเซ็นผู้ช่วยสอน",
  ];
  const hr = ws.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    c.border = allBorder;
  });
  hr.height = 30;

  // ---- Data rows ----
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const displayRows = preRows || buildDisplayRows(user, rows, monthStart, monthEnd, blackouts, { rate: RATE, maxHours: MAXH });
  let r = headerRowIdx + 1;
  let totalHours = 0;
  let totalMoney = 0;
  displayRows.forEach((e, idx) => {
    const sec = e.section || {};
    const h = e.hours;
    const rate = e.rate;
    const money = e.money;
    totalHours = round2(totalHours + h);
    totalMoney = round2(totalMoney + money);
    const row = ws.getRow(r);
    const vals = [
      idx + 1,
      sec.course?.code || "",
      sec.section || "",
      sec.curriculum?.code || "",
      user.full_name,
      e.work_date,
      h,
      rate,
      money,
      e.remark || "",
      "", // signature
    ];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.border = allBorder;
      c.font = { size: 11 };
      if ([0, 1, 2, 3, 5, 6].includes(i)) c.alignment = { horizontal: "center" };
      if ([7, 8].includes(i)) { c.alignment = { horizontal: "right" }; c.numFmt = "#,##0.00"; }
    });
    row.height = 22;
    r++;
  });

  // ---- Totals row ----
  const totRow = ws.getRow(r);
  ws.mergeCells(`A${r}:F${r}`);
  const tlabel = totRow.getCell(1);
  tlabel.value = `รวม ${displayRows.length} รายการ`;
  tlabel.font = { bold: true };
  tlabel.alignment = { horizontal: "right" };
  totRow.getCell(7).value = Math.round(totalHours * 100) / 100;
  totRow.getCell(7).alignment = { horizontal: "center" };
  totRow.getCell(7).font = { bold: true };
  totRow.getCell(9).value = Math.round(totalMoney * 100) / 100;
  totRow.getCell(9).numFmt = "#,##0.00";
  totRow.getCell(9).alignment = { horizontal: "right" };
  totRow.getCell(9).font = { bold: true };
  for (let i = 1; i <= 11; i++) totRow.getCell(i).border = allBorder;
  r += 2;

  // ---- Signature footer: 4 columns ----
  // [ผู้จัดทำ/ผู้ตรวจสอบ] [หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า] [ผู้อนุมัติ] [ผู้จ่ายเงิน]
  const blocks = [
    { start: "A", end: "C", anchor: "A", label: "ผู้จัดทำ/ผู้ตรวจสอบ" },
    { start: "D", end: "F", anchor: "D", label: "หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า" },
    { start: "G", end: "H", anchor: "G", label: "ผู้อนุมัติ" },
    { start: "I", end: "K", anchor: "I", label: "ผู้จ่ายเงิน" },
  ];
  const headRow = r;
  blocks.forEach((b) => {
    ws.mergeCells(`${b.start}${headRow}:${b.end}${headRow}`);
    const c = ws.getCell(`${b.start}${headRow}`);
    c.value = b.label;
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(headRow).height = 30;

  const lines = [
    "ลงชื่อ ....................................................",
    "(....................................................)",
    "ตำแหน่ง ................................................",
    "วันที่ ......./......./.......",
  ];
  blocks.forEach((b) => {
    lines.forEach((txt, i) => {
      const rr = headRow + 2 + i;
      ws.mergeCells(`${b.start}${rr}:${b.end}${rr}`);
      const c = ws.getCell(`${b.start}${rr}`);
      c.value = txt;
      c.font = { size: 11 };
      c.alignment = { horizontal: "center" };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
