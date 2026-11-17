import ExcelJS from "exceljs";

// "สรุปรวมรายบุคคล ทั้งเทอม" — sheet "ป.ตรี" (ทุน, converted hours/amount) + sheet "บัณฑิตศึกษา" (TA/RA):
//   ลำดับที่ | ชื่อ-สกุล | รหัสนักศึกษา | รวมชั่วโมง | จำนวนครั้ง (วัน) | จำนวนเงิน (บาท)
// Same look as the office summary forms (TH SarabunPSK 14, boxed table, signature block).

const FONT = "TH SarabunPSK";
const thin = { style: "thin", color: { argb: "FF000000" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const f14 = (extra = {}) => ({ name: FONT, size: 14, ...extra });
const round2 = (n) => Math.round(n * 100) / 100;
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function monthLong(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
}

// people: [{ user: {title, full_name, student_id}, hours, days, money, months: Set }]
function addTotalsSheet(wb, { level, people, term, f07 = {}, firstMonth, lastMonth, confirmedOnly = true, scholarshipRate = 50 }) {
  const isUg = level === "ug";
  const ws = wb.addWorksheet(isUg ? "ป.ตรี" : "บัณฑิตศึกษา", {
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  const widths = [7.5, 30, 14, 16, 13, 16];
  ws.columns = widths.map((w) => ({ width: w }));
  const N = widths.length; // F
  const LAST = "F";
  const termLabel = String(term || "").includes("/") ? term.split("/").reverse().join("/") : term;
  const period = firstMonth && lastMonth
    ? (firstMonth === lastMonth ? `ประจำเดือน ${monthLong(firstMonth)}` : `ประจำเดือน ${monthLong(firstMonth)} – ${monthLong(lastMonth)}`)
    : "";

  const titles = [
    isUg
      ? "สรุปรวมค่าตอบแทนทุนผู้ช่วยสอน (TA) นักศึกษาระดับปริญญาตรี รายบุคคล"
      : "สรุปรวมค่าตอบแทนทุนผู้ช่วยสอน (TA/RA) นักศึกษาระดับบัณฑิตศึกษา รายบุคคล",
    `ประจำภาคการศึกษา ${termLabel}` + (period ? ` · ${period}` : ""),
    confirmedOnly ? "(รวมทุกเดือน เฉพาะรายการที่ยืนยันนำส่งแล้ว)" : "(รวมทุกเดือน ทุกรายการที่ลงเวลาไว้)",
  ];
  titles.forEach((txt, i) => {
    const r = i + 1;
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = txt;
    c.font = f14({ bold: i < 2 });
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 18.75;
  });

  // header
  const headers = ["ลำดับที่", "ชื่อ-สกุล", "รหัสนักศึกษา",
    isUg ? `รวมชั่วโมงเบิกได้ (${scholarshipRate}฿/ชม.)` : "รวมชั่วโมง",
    "จำนวนครั้ง (วัน)", isUg ? "ยอดเบิก (บาท)" : "จำนวนเงิน (บาท)"];
  const HR = 5;
  const hr = ws.getRow(HR);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = f14({ bold: true });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = box;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  });
  hr.height = 22.5;

  let r = HR + 1;
  const firstData = r;
  people.forEach((p, idx) => {
    const row = ws.getRow(r);
    const sid = p.user.student_id ? (/^\d+$/.test(p.user.student_id) ? Number(p.user.student_id) : p.user.student_id) : "";
    const name = `${p.user.title || ""} ${p.user.full_name || ""}`.replace(/\s+/g, " ").trim();
    const vals = [idx + 1, name, sid, round2(p.hours), p.days, round2(p.money)];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = f14();
      c.border = box;
      c.alignment = { horizontal: i === 1 ? "left" : "center", vertical: "middle", wrapText: i === 1 };
      if (i === 3) c.numFmt = "#,##0.00";
      if (i === 4) c.numFmt = "#,##0";
      if (i === 5) c.numFmt = "#,##0.00";
    });
    row.height = 22.5;
    r++;
  });
  if (!people.length) {
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = confirmedOnly ? "— ไม่มีรายการที่ยืนยันนำส่งในเทอมนี้ —" : "— ไม่มีรายการในเทอมนี้ —";
    c.font = f14({ italic: true });
    c.alignment = { horizontal: "center", vertical: "middle" };
    for (let i = 1; i <= N; i++) ws.getRow(r).getCell(i).border = box;
    ws.getRow(r).height = 22.5;
    r++;
  }
  // total row
  const tr = ws.getRow(r);
  ws.mergeCells(`A${r}:C${r}`);
  tr.getCell(1).value = "รวมทั้งสิ้น";
  tr.getCell(1).font = f14({ bold: true });
  tr.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  for (let i = 1; i <= N; i++) tr.getCell(i).border = box;
  if (people.length) {
    const sums = {
      4: round2(people.reduce((a, p) => a + p.hours, 0)),
      5: people.reduce((a, p) => a + p.days, 0),
      6: round2(people.reduce((a, p) => a + p.money, 0)),
    };
    [4, 5, 6].forEach((i) => {
      const L = String.fromCharCode(64 + i);
      const c = tr.getCell(i);
      c.value = { formula: `SUM(${L}${firstData}:${L}${r - 1})`, result: sums[i] };
      c.font = f14({ bold: true });
      c.numFmt = i === 5 ? "#,##0" : "#,##0.00";
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
  }
  tr.height = 22.5;
  r += 2;

  // signatures
  const put = (addr, txt, align) => {
    const c = ws.getCell(addr);
    c.value = txt;
    c.font = f14();
    if (align) c.alignment = { horizontal: align, vertical: "middle" };
  };
  put(`D${r}`, "ลงชื่อ....................................................ผู้จ่ายเงิน");
  put(`D${r + 1}`, "(.....................................................................)");
  r += 4;
  put(`A${r}`, "ลงชื่อ....................................ผู้จัดทำ");
  put(`D${r}`, "ลงชื่อ.............................................ผู้รับรอง");
  r++;
  put(`A${r}`, f07.preparer ? `(${f07.preparer})` : "(.....................................................................)");
  put(`D${r}`, f07.certifier ? `(${f07.certifier})` : "(.....................................................................)");
  ws.pageSetup.printArea = `A1:${LAST}${r}`;
  return ws;
}

// ug / grad: [{ user: {title, full_name, student_id}, hours, days, money }]
export async function buildTotalsWorkbook({ ug, grad, term, f07, firstMonth, lastMonth, confirmedOnly = true, scholarshipRate = 50 }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  const common = { term, f07, firstMonth, lastMonth, confirmedOnly, scholarshipRate };
  addTotalsSheet(wb, { level: "ug", people: ug, ...common });
  addTotalsSheet(wb, { level: "grad", people: grad, ...common });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
