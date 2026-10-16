import ExcelJS from "exceljs";

// "สรุปยอดเบิกรายคน ทั้งเทอม" — one sheet per student level (ป.ตรี / บัณฑิตศึกษา),
// following the office's summary_total_TA_Compensation_Student.xlsx template:
//   ลำดับที่ | ชื่อ-สกุล | รหัสนักศึกษา | <one column per month> | จำนวนเงินรวม
// Month columns run from the first to the last month that has timesheet data in the term.

const FONT = "TH SarabunPSK";
const thin = { style: "thin", color: { argb: "FF000000" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const f14 = (extra = {}) => ({ name: FONT, size: 14, ...extra });
const TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const round2 = (n) => Math.round(n * 100) / 100;
const colLetter = (i) => {
  let s = "";
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// "2026-06" → "มิ.ย."  (add the BE year when the range crosses a year)
function monthLabel(ym, withYear) {
  const [y, m] = ym.split("-").map(Number);
  return withYear ? `${TH_SHORT[m - 1]} ${String(y + 543).slice(-2)}` : TH_SHORT[m - 1];
}
function fiscalYearBE(ym) {
  const [y, m] = ym.split("-").map(Number);
  return y + 543 + (m >= 10 ? 1 : 0);
}
// all months from first..last inclusive ("YYYY-MM")
export function monthRange(first, last) {
  if (!first || !last) return [];
  const out = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// people: [{ user: {title, full_name, student_id}, byMonth: { "YYYY-MM": money } }]
function addSheet(wb, { level, people, months, term, f07 = {} }) {
  const isUg = level === "ug";
  const ws = wb.addWorksheet(isUg ? "ป.ตรี" : "บัณฑิตศึกษา", {
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });

  const nMonths = months.length;
  const widths = [6.6, 24.6, 12.7, ...months.map(() => 9.7), 11.4];
  ws.columns = widths.map((w) => ({ width: w }));
  const N = widths.length;
  const LAST = colLetter(N);
  const TOTAL_COL = N;
  const withYear = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  const termLabel = String(term || "").includes("/") ? term.split("/").reverse().join("/") : term;
  const noticeDate = (isUg ? f07.noticeDateUg : f07.noticeDateGrad) || "";
  const levelText = isUg ? "นักศึกษาระดับปริญญาตรี" : "นักศึกษาระดับบัณฑิตศึกษา(ปริญญาโทหรือปริญญาเอก)";
  const fy = months.length ? fiscalYearBE(months[months.length - 1]) : fiscalYearBE(new Date().toISOString().slice(0, 7));

  // ---- title rows 1–4 (row 4 merged but blank, as in the template) ----
  const titles = [
    `หลักฐานการจ่ายค่าตอบแทนนักศึกษาช่วยงาน ประจำปีงบประมาณ ${fy}`,
    `เบิกเงินตามประกาศรายชื่อ${levelText}ที่ได้รับทุนผู้ช่วยสอน (TA)ประจำภาคการศึกษา ${termLabel}` + (noticeDate ? ` ลงวันที่ ${noticeDate}` : ""),
    "ฏีกาเงินรายได้ประจำปี.................................................................................เลขที่............................................ ลงวันที่...........................................",
    "",
  ];
  titles.forEach((txt, i) => {
    const r = i + 1;
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = txt;
    c.font = f14({ bold: true });
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 18.75;
  });
  const st = ws.getCell("B5");
  st.value = "ข้าพเจ้าผู้มีนามท้ายนี้ได้รับเงินจากวิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ ไปเป็นการถูกต้องแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญ";
  st.font = f14();
  ws.getRow(5).height = 18.75;

  // ---- header row 6 ----
  const headers = ["ลำดับที่", "ชื่อ-สกุล", "รหัสนักศึกษา", ...months.map((m) => monthLabel(m, withYear)), "จำนวนเงินรวม"];
  const hr = ws.getRow(6);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = f14();
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = box;
  });
  hr.height = 18.75;

  // ---- data rows ----
  let r = 7;
  const firstData = r;
  people.forEach((p, idx) => {
    const row = ws.getRow(r);
    const sid = p.user.student_id ? (/^\d+$/.test(p.user.student_id) ? Number(p.user.student_id) : p.user.student_id) : "";
    const vals = [idx + 1, `${p.user.title || ""} ${p.user.full_name || ""}`.replace(/\s+/g, " ").trim(), sid];
    months.forEach((m) => vals.push(round2(p.byMonth[m] || 0)));
    const first = colLetter(4), last = colLetter(3 + nMonths);
    const total = round2(months.reduce((a, m) => a + (p.byMonth[m] || 0), 0));
    vals.push(nMonths ? { formula: `SUM(${first}${r}:${last}${r})`, result: total } : total);
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = f14();
      c.border = box;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: i === 1 };
      if (i >= 3) c.numFmt = "#,##0.00";
    });
    row.height = 22.5;
    r++;
  });
  if (people.length === 0) {
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = "— ไม่มีรายการที่ยืนยันนำส่งในช่วงนี้ —";
    c.font = f14({ italic: true });
    c.alignment = { horizontal: "center", vertical: "middle" };
    for (let i = 1; i <= N; i++) ws.getRow(r).getCell(i).border = box;
    row_height_fix(ws, r);
    r++;
  }
  // ---- grand total row ----
  const tr = ws.getRow(r);
  ws.mergeCells(`A${r}:C${r}`);
  tr.getCell(1).value = "รวมทั้งสิ้น";
  tr.getCell(1).font = f14({ bold: true });
  tr.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  for (let i = 1; i <= N; i++) tr.getCell(i).border = box;
  if (people.length) {
    for (let i = 4; i <= TOTAL_COL; i++) {
      const L = colLetter(i);
      const colTotal = round2(people.reduce((a, p) => a + (i === TOTAL_COL ? months.reduce((x, m) => x + (p.byMonth[m] || 0), 0) : (p.byMonth[months[i - 4]] || 0)), 0));
      const c = tr.getCell(i);
      c.value = { formula: `SUM(${L}${firstData}:${L}${r - 1})`, result: colTotal };
      c.font = f14({ bold: true });
      c.numFmt = "#,##0.00";
      c.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  tr.height = 22.5;
  r += 2;

  // ---- signatures (same positions as the template, relative to the last column) ----
  const sigCol = colLetter(Math.max(4, N - 1)); // "H" in the 5-month template
  const put = (addr, txt, align) => {
    const c = ws.getCell(addr);
    c.value = txt;
    c.font = f14();
    if (align) c.alignment = { horizontal: align, vertical: "middle" };
  };
  put(`${sigCol}${r}`, "ลงชื่อ....................................................ผู้จ่ายเงิน");
  put(`${sigCol}${r + 1}`, "(.....................................................................)");
  r += 4;
  put(`B${r}`, "ลงชื่อ....................................ผู้จัดทำ");
  put(`D${r}`, "ลงชื่อ.............................................ผู้รับรอง");
  put(`${sigCol}${r}`, "ลงชื่อ....................................................ผู้อนุมัติ");
  r++;
  put(`B${r}`, f07.preparer ? `(${f07.preparer})` : "(.....................................................................)", "center");
  put(`D${r}`, f07.certifier ? `(${f07.certifier})` : "(.....................................................................)", "center");
  put(`${sigCol}${r}`, "(.....................................................................)");
  ws.pageSetup.printArea = `A1:${LAST}${r}`;
  return ws;
}
function row_height_fix(ws, r) { ws.getRow(r).height = 22.5; }

export async function buildStudentSummaryWorkbook({ ug, grad, months, term, f07 }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  addSheet(wb, { level: "ug", people: ug, months, term, f07 });
  addSheet(wb, { level: "grad", people: grad, months, term, f07 });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
