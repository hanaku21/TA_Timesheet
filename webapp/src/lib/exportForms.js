import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { buildTimesheetWorkbook } from "@/lib/buildTimesheetXlsx";
import { buildWorkTimeSheetWorkbook } from "@/lib/buildWorkTimeSheetXlsx";
import { buildTaRaWorkbook } from "@/lib/buildTaRaXlsx";
import { buildTimesheetPdf } from "@/lib/buildTimesheetPdf";
import { buildWorkTimeSheetPdf } from "@/lib/buildWorkTimeSheetPdf";
import { buildTaRaPdf } from "@/lib/buildTaRaPdf";

const TOR_TITLE = "แบบใบเบิกค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน";

// ---- single-form outputs (one section, or all rows on one form) ----
export async function formWorkbook({ user, month, displayRows, payConfig }) {
  const emp = user.employment_type;
  if (emp === "SCHOLARSHIP") return buildWorkTimeSheetWorkbook({ user, month, displayRows });
  if (emp === "TA_RA") return buildTaRaWorkbook({ user, month, displayRows });
  if (emp === "TOR") return buildTaRaWorkbook({ user, month, displayRows, title: TOR_TITLE });
  return buildTimesheetWorkbook({ user, month, payConfig, displayRows });
}

export async function formPdf({ user, month, displayRows, payConfig }) {
  const emp = user.employment_type;
  if (emp === "SCHOLARSHIP") return buildWorkTimeSheetPdf({ user, month, displayRows });
  if (emp === "TA_RA") return buildTaRaPdf({ user, month, displayRows });
  if (emp === "TOR") return buildTaRaPdf({ user, month, displayRows, title: TOR_TITLE });
  return buildTimesheetPdf({ user, month, payConfig, displayRows });
}

// add one worksheet (for one section's rows) to an existing workbook
function addSheet(wb, { user, month, displayRows, sheetName }) {
  const emp = user.employment_type;
  if (emp === "SCHOLARSHIP") return buildWorkTimeSheetWorkbook({ user, month, displayRows, wb, sheetName });
  if (emp === "TOR") return buildTaRaWorkbook({ user, month, displayRows, title: TOR_TITLE, wb, sheetName });
  return buildTaRaWorkbook({ user, month, displayRows, wb, sheetName });
}

function groupBySection(displayRows) {
  const m = new Map();
  for (const r of displayRows || []) {
    const sid = r.section?.id ?? "—";
    if (!m.has(sid)) m.set(sid, []);
    m.get(sid).push(r);
  }
  return [...m.values()];
}

function sheetNameFor(rows, i, used) {
  const s = rows[0]?.section || {};
  let base = `${s.course?.code || "วิชา"}_${s.section || i + 1}`
    .replace(/[\\/*?:[\]]/g, "_")
    .slice(0, 28);
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}_${n++}`;
  used.add(name);
  return name.slice(0, 31);
}

// ---- combined: one WORKSHEET per section ----
export async function combinedWorkbook({ user, month, displayRows, payConfig }) {
  const groups = groupBySection(displayRows);
  if (groups.length <= 1) return formWorkbook({ user, month, displayRows, payConfig });
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  const used = new Set();
  let i = 0;
  for (const rows of groups) {
    await addSheet(wb, { user, month, displayRows: rows, sheetName: sheetNameFor(rows, i, used) });
    i += 1;
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---- combined: one form (page) per section, merged into one PDF ----
export async function combinedPdf({ user, month, displayRows, payConfig }) {
  const groups = groupBySection(displayRows);
  if (groups.length <= 1) return formPdf({ user, month, displayRows, payConfig });
  const master = await PDFDocument.create();
  for (const rows of groups) {
    const buf = await formPdf({ user, month, displayRows: rows, payConfig });
    const src = await PDFDocument.load(buf);
    const pages = await master.copyPages(src, src.getPageIndices());
    pages.forEach((p) => master.addPage(p));
  }
  const bytes = await master.save();
  return Buffer.from(bytes);
}
