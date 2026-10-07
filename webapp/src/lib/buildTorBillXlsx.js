import ExcelJS from "exceljs";
import { bahtText } from "@/lib/bahtText";

// ใบวางบิล / ใบแจ้งค่าใช้จ่าย  and  ใบเสร็จรับเงิน  for จ้างเหมา (TOR) TAs — one document per
// เลข TOR. Layout follows the office's Excel templates (Sarabun 10, A4 portrait, cols A–I).
//   kind: "bill" | "receipt"
//   user: { title, full_name, address, phone, id_card }
//   tor: "CAMT/1920"   amount: ยอดสั่งจ้างทั้งสัญญา
//   subjects: [{ code, name, section }] of that TOR → "จ้างเหมาผู้ช่วยสอนวิชา 954340 ชื่อวิชา ตอน 004 (ชื่อ TA)"
//   termCode: "2569/1" → doc no. IN1-69-1920 / R1-69-1920 (เทอม-ปี-เลข TOR)

const FONT = "Sarabun";
const thin = { style: "thin", color: { argb: "FF000000" } };
const ACC_FMT = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
const f10 = (extra = {}) => ({ name: FONT, size: 10, ...extra });

const COMPANY = {
  name: "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี",
  address: "239 ถ.ห้วยแก้ว ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
  phone: "053-920299",
  taxId: "0994000423179",
  branch: "R สำนักงานใหญ่",
};

export function torDigits(tor) {
  const m = String(tor || "").match(/(\d+)\s*$/);
  return m ? m[1] : String(tor || "").replace(/[^\d]/g, "");
}

// Shared text/number helpers used by both the .xlsx and .pdf builders
export function itemText(subjects, fullName) {
  // group sections of the same course: "960231 ชื่อวิชา ตอน 001 และ ตอน 002"
  const byCourse = new Map();
  for (const x of subjects || []) {
    const key = `${x.code || ""}|${x.name || ""}`;
    if (!byCourse.has(key)) byCourse.set(key, { code: x.code || "", name: x.name || "", sections: [] });
    if (x.section) byCourse.get(key).sections.push(x.section);
  }
  const parts = [...byCourse.values()].map((c) => {
    const secs = [...new Set(c.sections)].sort().map((sec) => `ตอน ${sec}`).join(" และ ");
    return `${c.code}${c.name ? " " + c.name : ""}${secs ? " " + secs : ""}`.trim();
  });
  const subj = parts.length ? parts.join(" / ") : "-";
  return `จ้างเหมาผู้ช่วยสอน รายวิชา ${subj} (${fullName})`;
}
// "คำนำหน้า ชื่อ นามสกุล" (space between title and name)
export function displayName(user) {
  return `${user?.title || ""} ${user?.full_name || ""}`.replace(/\s+/g, " ").trim();
}
// Document number: IN<เทอม>-<ปี 2 หลัก>-<เลขท้าย TOR>  e.g. term "2569/1", TOR CAMT/1964 → IN1-69-1964
// (receipt uses the prefix R instead of IN)
export function docNumber(kind, termCode, tor) {
  const [yearStr, semStr] = String(termCode || "").split("/");
  const yearBE = Number(yearStr) || new Date().getFullYear() + 543;
  const yy = String(yearBE % 100).padStart(2, "0");
  const sem = (semStr || "1").replace(/\D/g, "") || "1";
  return `${kind === "bill" ? "IN" : "R"}${sem}-${yy}-${torDigits(tor)}`;
}
export const COMPANY_INFO = {
  name: "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี",
  address: "239 ถ.ห้วยแก้ว ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
  phone: "053-920299",
  taxId: "0994000423179",
  branch: "R สำนักงานใหญ่",
};

export async function buildTorDocWorkbook({ kind, user, tor, amount, subjects, termCode }) {
  const isBill = kind === "bill";
  const fillColor = isBill ? "FFDEEAF6" : "FFE7E6E6";
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
  const fullName = displayName(user);
  const docNo = docNumber(kind, termCode, tor);
  const total = Math.round(Number(amount || 0) * 100) / 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  const ws = wb.addWorksheet(isBill ? "ใบแจ้ง" : "ใบเสร็จ", {
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = [9, 10.1, 11.9, 9, 12.1, 9, 1.1, 10.9, 9].map((w) => ({ width: w }));
  for (let r = 1; r <= 38; r++) ws.getRow(r).height = 24;
  ws.getRow(6).height = 10.5;
  ws.getRow(12).height = 12;

  // helpers --------------------------------------------------------------
  const cell = (addr, value, { bold, h, v, wrap, fmt, u, fill: fl } = {}) => {
    const c = ws.getCell(addr);
    if (value !== undefined) c.value = value;
    c.font = f10({ bold: !!bold, underline: u ? true : undefined });
    if (h || v || wrap) c.alignment = { horizontal: h, vertical: v, wrapText: !!wrap };
    if (fmt) c.numFmt = fmt;
    if (fl) c.fill = fill;
    return c;
  };
  const colIdx = (L) => L.charCodeAt(0) - 64;
  // apply edges (string of l r t b) to a cell, keeping other edges
  const edge = (addr, spec) => {
    const c = ws.getCell(addr);
    const b = { ...(c.border || {}) };
    if (spec.includes("l")) b.left = thin;
    if (spec.includes("r")) b.right = thin;
    if (spec.includes("t")) b.top = thin;
    if (spec.includes("b")) b.bottom = thin;
    c.border = b;
  };
  const edgesRow = (row, map) => Object.entries(map).forEach(([L, spec]) => edge(`${L}${row}`, spec));
  // box a (merged) range
  const boxRange = (c1, r1, c2, r2) => {
    for (let r = r1; r <= r2; r++) for (let ci = colIdx(c1); ci <= colIdx(c2); ci++) {
      const L = String.fromCharCode(64 + ci);
      let spec = "";
      if (ci === colIdx(c1)) spec += "l";
      if (ci === colIdx(c2)) spec += "r";
      if (r === r1) spec += "t";
      if (r === r2) spec += "b";
      if (spec) edge(`${L}${r}`, spec);
    }
  };

  // ---- header: TA (seller) block -------------------------------------
  if (isBill) {
    cell("A1", "ชื่อ ", { bold: true });
    cell("B1", fullName);
  } else {
    cell("A1", fullName, { bold: true });
  }
  ws.mergeCells("F1:I1");
  cell("F1", isBill ? "ใบวางบิล / ใบแจ้งค่าใช้จ่าย" : "ใบเสร็จรับเงิน", { bold: true, h: "right" });
  cell("A2", "ที่อยู่ ");
  cell("B2", user.address || "");
  ws.mergeCells("H2:I3");
  cell("H2", "หน้า 1/1", { h: "right", v: "middle" });
  cell("A4", "โทร. ");
  cell("B4", user.phone || "");
  cell("A5", "เลขประจำตัวผู้เสียภาษี ");
  cell("C5", user.id_card || "");

  // ---- customer (CAMT) box rows 7–11 ------------------------------------
  edgesRow(7, { A: "lt", B: "t", C: "t", D: "t", E: "t", F: "rt" });
  ws.mergeCells("H7:I7");
  cell("H7", "วันที่", { h: "center", fill: true });
  boxRange("H", 7, "I", 7);

  cell("A8", "ชื่อลูกค้า");
  cell("B8", COMPANY.name);
  edgesRow(8, { A: "l", F: "r" });
  ws.mergeCells("H8:I8");
  cell("H8", undefined, { h: "center", fmt: "[$-107041E]d mmm yy" }); // left blank — filled in by hand
  boxRange("H", 8, "I", 8);

  cell("A9", "ที่อยู่");
  cell("B9", COMPANY.address);
  edgesRow(9, { A: "l", F: "r" });
  ws.mergeCells("H9:I9");

  cell("A10", "โทรศัพท์");
  ws.mergeCells("B10:C10");
  cell("B10", COMPANY.phone, { h: "left", fmt: "@" });
  edgesRow(10, { A: "l", F: "r" });
  ws.mergeCells("H10:I10");
  cell("H10", isBill ? "เลขที่ใบวางบิล" : "เลขที่เอกสาร", { h: "center", fill: true });
  boxRange("H", 10, "I", 10);

  cell("A11", "เลขประจำตัวผู้เสียภาษี");
  ws.mergeCells("C11:D11");
  cell("C11", COMPANY.taxId, { h: "left", fmt: "@" });
  cell("E11", COMPANY.branch, { h: "left", fmt: "@" });
  edgesRow(11, { A: "lb", B: "b", C: "b", D: "b", E: "b", F: "rb" });
  ws.mergeCells("H11:I11");
  cell("H11", docNo, { h: "center" });
  boxRange("H", 11, "I", 11);

  // ---- items table rows 13–21 -----------------------------------------
  cell("A13", "ลำดับที่", { bold: true, h: "center" });
  boxRange("A", 13, "A", 13);
  ws.mergeCells("B13:D13");
  cell("B13", "รายการ", { bold: true, h: "center" });
  boxRange("B", 13, "D", 13);
  ws.mergeCells("E13:F13");
  cell("E13", "ประจำงวด/เดือน", { bold: true, h: "center" });
  boxRange("E", 13, "F", 13);
  ws.mergeCells("G13:I13");
  cell("G13", "จำนวนเงิน", { bold: true, h: "center" });
  boxRange("G", 13, "I", 13);

  ws.mergeCells("A14:A21");
  cell("A14", 1, { h: "center", v: "top" });
  boxRange("A", 14, "A", 21);
  ws.mergeCells("B14:D21");
  cell("B14", itemText(subjects, fullName), { h: "left", v: "top", wrap: true });
  boxRange("B", 14, "D", 21);
  ws.mergeCells("E14:F21");
  cell("E14", "-", { h: "center", v: "top", fmt: "@" });
  boxRange("E", 14, "F", 21);
  ws.mergeCells("G14:I21");
  cell("G14", total, { h: "center", v: "top", fmt: ACC_FMT });
  boxRange("G", 14, "I", 21);

  // ---- totals rows 22–24 ----------------------------------------------
  ws.mergeCells("A22:F22");
  cell("A22", "รวมเป็นเงิน", { h: "right", fill: true });
  edgesRow(22, { A: "lt", B: "t", C: "t", D: "t", E: "t", F: "t" });
  ws.mergeCells("G22:I22");
  cell("G22", isBill ? total : { formula: "SUM(G14:I21)", result: total }, { h: "center", fmt: ACC_FMT, fill: true });
  edgesRow(22, { G: "lt", H: "t", I: "rt" });

  ws.mergeCells("A23:E23");
  edgesRow(23, { A: "ltb", B: "tb", C: "tb", D: "tb", E: "tb" });
  cell("F23", "ส่วนลด", { h: "right" });
  edge("F23", "tb");
  ws.mergeCells("G23:I23");
  cell("G23", 0, { h: "center", fmt: ACC_FMT });
  edgesRow(23, { G: "lt", H: "t", I: "rt" });

  cell("A24", "จำนวนเงิน", { bold: true, fill: true });
  edge("A24", "ltb");
  ws.mergeCells("B24:E24");
  cell("B24", bahtText(total), { h: "center", fill: true });
  edgesRow(24, { B: "tb", C: "tb", D: "tb", E: "tb" });
  cell("F24", "จำนวนรวม", { bold: true, h: "right", fill: true });
  edge("F24", "tb");
  ws.mergeCells("G24:I24");
  cell("G24", isBill ? total : { formula: "G22", result: total }, { bold: true, h: "center", fmt: ACC_FMT, fill: true });
  boxRange("G", 24, "I", 24);

  // ---- note box rows 25–26 --------------------------------------------
  ws.mergeCells("A25:F26");
  cell("A25", "หมายเหตุ : ", { h: "left", v: "top", wrap: true });
  edgesRow(25, { A: "lt", B: "t", C: "t", D: "t", E: "t", F: "t", G: "t", H: "t", I: "rt" });
  edgesRow(26, { A: "lb", B: "b", C: "b", D: "b", E: "b", F: "b", G: "b", H: "b", I: "rb" });

  // ---- paid stamp (receipt only; no bank/account block per office request) ----
  if (!isBill) {
    ws.mergeCells("E29:H29");
    cell("E29", "ได้รับชำระเรียบร้อยแล้ว", { h: "center" });
  }

  // ---- signature --------------------------------------------------------
  ws.mergeCells("E32:H32");
  cell("E32", isBill ? "ลงชื่อผู้วางบิล ............................................" : "ลงชื่อ .......................................................", { h: "center" });
  ws.mergeCells("E33:H33");
  cell("E33", `      (${fullName})`, { h: "center" });
  ws.mergeCells("E34:H34");
  cell("E34", "         วันที่ .............................................", { h: "left" });
  if (isBill) {
    // receiver of the billing note
    ws.mergeCells("E36:H36");
    cell("E36", "ลงชื่อผู้รับใบวางบิล.......................................", { h: "center" });
    ws.mergeCells("E37:H37");
    cell("E37", "(...................................................................)", { h: "center" });
  }

  ws.pageSetup.printArea = isBill ? "A1:I38" : "A1:I36";
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
