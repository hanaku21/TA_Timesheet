import ExcelJS from "exceljs";
import { TH_MONTHS } from "@/lib/constants";
import { bahtText } from "@/lib/bahtText";

const round2 = (n) => Math.round(n * 100) / 100;
const num = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2025-12-04" -> "04/12/2568"  (dd/MM/YYYY, Buddhist year)
export function fmtDateTaRa(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

const MIN_ROWS = 8; // keep the blank ruled rows like the printed form

// Work out the ระดับ / หลักสูตร tick boxes from the course code + section:
//   ระดับ    — 4th digit of the course code (xxxNxx): N >= 5 -> บัณฑิตศึกษา, else ปริญญาตรี
//              e.g. 954374 -> "3" -> ปริญญาตรี ; 958113 -> "8"... (index 3 = "1") -> ปริญญาตรี
//   หลักสูตร — section starting with 7 or 8 -> นานาชาติ ; starting with 0 -> ภาคปกติ
//              (anything else is left unticked for the office to fill in)
export function deriveLevelAndProgram(displayRows) {
  const rows = displayRows || [];
  let graduate = null;
  let program = null; // "normal" | "special" | "inter"

  for (const r of rows) {
    const code = String(r.section?.course?.code || "").replace(/\D/g, "");
    if (graduate === null && code.length >= 4) {
      graduate = Number(code[3]) >= 5;
    }
    const sec = String(r.section?.section || "").replace(/\D/g, "");
    if (program === null && sec.length >= 1) {
      if (sec[0] === "7" || sec[0] === "8") program = "inter";
      else if (sec[0] === "0") program = "normal";
    }
    if (graduate !== null && program !== null) break;
  }
  return { graduate, program };
}

// "แบบใบเบิกค่าตอบแทนทุนผู้ช่วยสอน" — the TA/RA form.
// `title` overrides the first line (TOR/จ้างเหมา reuses this template with its own title).
export async function buildTaRaWorkbook({ user, month, displayRows, title, wb: extWb, sheetName }) {
  const wb = extWb || new ExcelJS.Workbook();
  if (!extWb) wb.creator = "CAMT TA Timesheet";
  const ws = wb.addWorksheet(sheetName || "ใบเบิก", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  // A ชื่อผู้สอน | B วันเดือนปีที่สอน | C กระบวนวิชา | D จำนวนชั่วโมงที่สอน
  // E ค่าสอนชั่วโมงละ | F รวมจำนวนเงินค่าสอน | G ผู้รับเงิน | H หมายเหตุ
  ws.columns = [
    { width: 24 }, { width: 17 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];
  const LAST = "H";

  const thin = { style: "thin", color: { argb: "FF000000" } };
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin };

  // ---- Title block ----
  ws.mergeCells(`A1:${LAST}1`);
  const t1 = ws.getCell("A1");
  t1.value = title || "แบบใบเบิกค่าตอบแทนทุนผู้ช่วยสอน";
  t1.font = { bold: true, size: 13 };
  t1.alignment = { horizontal: "center" };

  ws.mergeCells(`A2:${LAST}2`);
  const t2 = ws.getCell("A2");
  t2.value = "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่";
  t2.font = { bold: true, size: 11 };
  t2.alignment = { horizontal: "center" };

  ws.mergeCells(`A3:${LAST}3`);
  const t3 = ws.getCell("A3");
  t3.value = `ประจำเดือน ${monthLabel}`;
  t3.font = { bold: true, size: 11 };
  t3.alignment = { horizontal: "center" };

  // ---- ระดับ / หลักสูตร (auto-ticked from course code + section) ----
  const { graduate, program } = deriveLevelAndProgram(displayRows);
  const box = (on) => (on ? "☑" : "☐");

  ws.getCell("B5").value = "ระดับ";
  ws.getCell("B5").font = { size: 10 };
  ws.getCell("B5").alignment = { horizontal: "right" };
  ws.getCell("C5").value = `${box(graduate === true)} บัณฑิตศึกษา`;
  ws.getCell("C6").value = `${box(graduate === false)} ปริญญาตรี`;

  ws.getCell("E5").value = "หลักสูตร";
  ws.getCell("E5").font = { size: 10 };
  ws.getCell("E5").alignment = { horizontal: "right" };
  ws.getCell("F5").value = `${box(program === "normal")} ภาคปกติ`;
  ws.getCell("F6").value = `${box(program === "special")} ภาคพิเศษ`;
  ws.getCell("F7").value = `${box(program === "inter")} นานาชาติ`;
  ["C5", "C6", "F5", "F6", "F7"].forEach((a) => {
    ws.getCell(a).font = { size: 10 };
  });

  // ---- Table header ----
  const HEADER_ROW = 9;
  const headers = [
    "ชื่อผู้สอน", "วันเดือนปีที่สอน", "กระบวนวิชา", "จำนวน\nชั่วโมงที่สอน",
    "ค่าสอน\nชั่วโมงละ", "รวมจำนวน\nเงินค่าสอน", "ผู้รับเงิน", "หมายเหตุ",
  ];
  const hr = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = allBorder;
  });
  hr.height = 32;

  // ---- Data rows ----
  const fullName = `${user.title || ""}${user.full_name}`.trim();
  let r = HEADER_ROW + 1;
  let total = 0;
  const rows = displayRows || [];

  rows.forEach((e) => {
    const sec = e.section || {};
    total = round2(total + Number(e.money || 0));
    const vals = [
      fullName,
      fmtDateTaRa(e.work_date),
      sec.course?.code || "",
      e.hours,
      e.rate,
      e.money,
      "", // ผู้รับเงิน (signature)
      e.remark || "",
    ];
    const xr = ws.getRow(r);
    vals.forEach((v, i) => {
      const c = xr.getCell(i + 1);
      c.value = v;
      c.border = allBorder;
      c.font = { size: 10 };
      c.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
      if (i === 4 || i === 5) c.numFmt = "#,##0";
    });
    xr.height = 18;
    r += 1;
  });

  // pad blank ruled rows
  for (let k = rows.length; k < MIN_ROWS; k++) {
    const xr = ws.getRow(r);
    for (let i = 1; i <= 8; i++) {
      xr.getCell(i).border = allBorder;
      xr.getCell(i).value = "";
    }
    xr.height = 18;
    r += 1;
  }

  // ---- Total row (grey #F2F2F2 background) ----
  const totRow = ws.getRow(r);
  ws.mergeCells(`A${r}:C${r}`);
  const tl = ws.getCell(`A${r}`);
  tl.value = "รวมจำนวนเงินที่ขอเบิก";
  tl.font = { bold: true, size: 10 };
  tl.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells(`D${r}:E${r}`);
  const tv = ws.getCell(`D${r}`);
  tv.value = total;
  tv.numFmt = "#,##0.00";
  tv.font = { bold: true, size: 10 };
  tv.alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells(`F${r}:H${r}`);
  const tb = ws.getCell(`F${r}`);
  tb.value = bahtText(total);
  tb.font = { size: 10 };
  tb.alignment = { horizontal: "center", vertical: "middle" };

  // borders + grey fill applied AFTER the merges (merging resets cell styles)
  const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  for (let i = 1; i <= 8; i++) {
    totRow.getCell(i).border = allBorder;
    totRow.getCell(i).fill = totalFill;
  }
  totRow.height = 20;
  r += 2;

  // ---- Signature footer: 4 blocks, aligned to the columns above ----
  //   A       | B–D                                   | E–F        | G–H
  //   ชื่อผู้สอน | วันที่ + กระบวนวิชา + จำนวนชั่วโมง        | ค่าสอน+รวมเงิน | ผู้รับเงิน+หมายเหตุ
  const blocks = [
    { start: "A", end: "A", label: "ผู้จัดทำ/ผู้ตรวจสอบ" },
    { start: "B", end: "D", label: "หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า" },
    { start: "E", end: "F", label: "ผู้อนุมัติ" },
    { start: "G", end: "H", label: "ผู้จ่ายเงิน" },
  ];
  const headRow = r;
  const mergeIf = (a, b2) => { if (a !== b2) ws.mergeCells(`${a}:${b2}`); };

  blocks.forEach((b) => {
    mergeIf(`${b.start}${headRow}`, `${b.end}${headRow}`);
    const c = ws.getCell(`${b.start}${headRow}`);
    c.value = b.label;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = allBorder;
  });
  ws.getRow(headRow).height = 22;

  // Footer lines. The dotted lines are grown to (approximately) fill the width
  // of each block's merged cell so "ลงชื่อ ....." spans the whole column.
  const colW = [24, 17, 13, 13, 13, 15, 15, 15]; // must match ws.columns widths (A–H)
  const idx = (letter) => letter.charCodeAt(0) - 65;
  const blockWidth = (b) => colW.slice(idx(b.start), idx(b.end) + 1).reduce((a, w) => a + w, 0);
  const DPU = 1.9; // ~dots per Excel column-width unit
  const dotsFor = (units) => ".".repeat(Math.max(4, Math.round(units * DPU)));

  const makeLine = (kind, w) => {
    if (kind === "paren") return "(" + dotsFor(w - 2) + ")";
    const prefix = kind === "sign" ? "ลงชื่อ " : kind === "role" ? "ตำแหน่ง " : "วันที่ ";
    return prefix + dotsFor(w - prefix.length);
  };
  const kinds = ["sign", "paren", "role", "date"];

  kinds.forEach((kind, i) => {
    const rr = headRow + 1 + i;
    blocks.forEach((b) => {
      mergeIf(`${b.start}${rr}`, `${b.end}${rr}`);
      const c = ws.getCell(`${b.start}${rr}`);
      c.value = makeLine(kind, blockWidth(b));
      c.font = { size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = {
        left: thin,
        right: thin,
        bottom: i === kinds.length - 1 ? thin : undefined,
      };
    });
    ws.getRow(rr).height = 18;
  });

  if (extWb) return wb; // caller adds more sheets + serializes
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
