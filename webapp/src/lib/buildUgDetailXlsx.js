import ExcelJS from "exceljs";

// "สรุปทุน ป.ตรี รายคน › รายเดือน › รายวิชา ทั้งเทอม"
// One row per (student, month, course/section):
//   ชื่อ-สกุล | รหัสนักศึกษา | เดือน | กระบวนวิชา | จำนวนครั้ง (วันที่ลงจริง) | วันในเอกสาร | ชม.จริง |
//   ชม.เบิกได้ | เงินตามอัตราจริง | ยอดเบิก | งบวิชา (ทั้งเทอม) | สถานะ
// followed by a subtotal row per student and a grand total.

const FONT = "TH SarabunPSK";
const thin = { style: "thin", color: { argb: "FF000000" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const f14 = (extra = {}) => ({ name: FONT, size: 14, ...extra });
const round2 = (n) => Math.round(n * 100) / 100;
const TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_SHORT[m - 1]} ${String(y + 543).slice(-2)}`;
};

// people: [{ user, rows: [{ month, code, section, label, days, docDays, hours, convHours, cost, convMoney, budget, confirmed }] }]
export async function buildUgDetailWorkbook({ people, term, scholarshipRate = 50, f07 = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAMT TA Timesheet";
  const ws = wb.addWorksheet("ป.ตรี รายวิชา-รายเดือน", {
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false, state: "frozen", ySplit: 5 }],
  });
  const widths = [6, 26, 12.5, 17, 10, 10.5, 10.5, 10.5, 12, 14, 13, 13, 13];
  ws.columns = widths.map((w) => ({ width: w }));
  const N = widths.length;
  const LAST = String.fromCharCode(64 + N); // M
  const termLabel = String(term || "").includes("/") ? term.split("/").reverse().join("/") : term;

  const titles = [
    "สรุปค่าตอบแทนทุนผู้ช่วยสอน (TA) นักศึกษาระดับปริญญาตรี รายคน › รายวิชา › รายเดือน",
    `ประจำภาคการศึกษา ${termLabel}` + (f07.noticeDateUg ? ` · ประกาศรายชื่อลงวันที่ ${f07.noticeDateUg}` : ""),
    `ทุกรายการที่ลงเวลาไว้ทั้งเทอม (คอลัมน์ "สถานะ" บอกว่ายืนยันนำส่งแล้วหรือยัง) · ชม.เบิกได้ = เงินตามอัตราจริง ÷ ${scholarshipRate} ปัดเป็น 0.5 ชม. · ยอดเบิก = ชม.เบิกได้ × ${scholarshipRate}`,
  ];
  titles.forEach((txt, i) => {
    const r = i + 1;
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = txt;
    c.font = f14({ bold: i < 2, italic: i === 2, size: i === 2 ? 12 : 14 });
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 18.75;
  });

  const HR = 5;
  const headers = [
    "ลำดับที่", "ชื่อ-สกุล", "รหัสนักศึกษา", "กระบวนวิชา", "เดือน",
    "จำนวนครั้ง\n(วันที่ลงจริง)", "วันในเอกสาร\n(≤8 ชม./วัน)", "ชม.จริง",
    `ชม.เบิกได้\n(${scholarshipRate}฿/ชม.)`, "เงินตามอัตราจริง\n(บาท)", "ยอดเบิก\n(บาท)", "งบวิชา\n(ทั้งเทอม)", "สถานะ",
  ];
  const hr = ws.getRow(HR);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = f14({ bold: true });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = box;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  });
  hr.height = 37.5;

  const MONEY = "#,##0.00";
  const grand = { days: 0, docDays: 0, hours: 0, convHours: 0, cost: 0, convMoney: 0 };
  let r = HR + 1;
  people.forEach((p, idx) => {
    const first = r;
    const sid = p.user.student_id ? (/^\d+$/.test(p.user.student_id) ? Number(p.user.student_id) : p.user.student_id) : "";
    const name = `${p.user.title || ""} ${p.user.full_name || ""}`.replace(/\s+/g, " ").trim();
    const sub = { days: 0, docDays: 0, hours: 0, convHours: 0, cost: 0, convMoney: 0 };
    const seenBudget = new Set();
    let budgetSum = 0;
    p.rows.forEach((x) => {
      const row = ws.getRow(r);
      const vals = [
        null, null, null, x.label, monthLabel(x.month),
        x.days, x.docDays == null ? "—" : x.docDays, round2(x.hours), round2(x.convHours),
        round2(x.cost), round2(x.convMoney), x.budget == null ? "—" : round2(x.budget),
        x.confirmed ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน",
      ];
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        if (v != null) c.value = v;
        c.font = f14({ color: i === 12 && !x.confirmed ? { argb: "FFC00000" } : undefined });
        c.border = box;
        c.alignment = { horizontal: i === 3 ? "left" : "center", vertical: "middle" };
        if ([9, 10, 11].includes(i) && typeof v === "number") c.numFmt = MONEY;
        if ([7, 8].includes(i)) c.numFmt = "0.0#";
      });
      row.height = 21;
      sub.days += x.days; sub.docDays += x.docDays || 0;
      sub.hours = round2(sub.hours + x.hours); sub.convHours = round2(sub.convHours + x.convHours);
      sub.cost = round2(sub.cost + x.cost); sub.convMoney = round2(sub.convMoney + x.convMoney);
      const bk = `${x.code}|${x.section}`;
      if (x.budget != null && !seenBudget.has(bk)) { seenBudget.add(bk); budgetSum = round2(budgetSum + x.budget); }
      r++;
    });
    // name / id / no. merged down the person's rows
    const last = r - 1;
    [[1, idx + 1], [2, name], [3, sid]].forEach(([col, v]) => {
      if (last > first) ws.mergeCells(first, col, last, col);
      const c = ws.getCell(first, col);
      c.value = v;
      c.alignment = { horizontal: col === 2 ? "left" : "center", vertical: "middle", wrapText: col === 2 };
    });
    // subtotal
    const tr = ws.getRow(r);
    ws.mergeCells(`A${r}:E${r}`);
    tr.getCell(1).value = `รวม ${name}`;
    const subVals = [sub.days, sub.docDays, sub.hours, sub.convHours, sub.cost, sub.convMoney, budgetSum, ""];
    subVals.forEach((v, i) => { tr.getCell(6 + i).value = v; });
    for (let i = 1; i <= N; i++) {
      const c = tr.getCell(i);
      c.font = f14({ bold: true });
      c.border = box;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      c.alignment = { horizontal: i === 1 ? "right" : "center", vertical: "middle" };
      if ([10, 11, 12].includes(i)) c.numFmt = MONEY;
      if ([8, 9].includes(i)) c.numFmt = "0.0#";
    }
    tr.height = 21;
    r++;
    Object.keys(grand).forEach((k) => { grand[k] = round2(grand[k] + sub[k]); });
  });
  if (!people.length) {
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = "— ไม่มีรายการลงเวลาของนักศึกษาทุน ป.ตรี ในเทอมนี้ —";
    c.font = f14({ italic: true });
    c.alignment = { horizontal: "center" };
    r++;
  }
  // grand total
  const gr = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  gr.getCell(1).value = "รวมทั้งสิ้น";
  [grand.days, grand.docDays, grand.hours, grand.convHours, grand.cost, grand.convMoney, "", ""].forEach((v, i) => { gr.getCell(6 + i).value = v; });
  for (let i = 1; i <= N; i++) {
    const c = gr.getCell(i);
    c.font = f14({ bold: true });
    c.border = box;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    c.alignment = { horizontal: i === 1 ? "right" : "center", vertical: "middle" };
    if ([10, 11].includes(i)) c.numFmt = MONEY;
    if ([8, 9].includes(i)) c.numFmt = "0.0#";
  }
  gr.height = 22.5;
  r += 2;
  const note = ws.getCell(`A${r}`);
  ws.mergeCells(`A${r}:${LAST}${r}`);
  note.value =
    "หมายเหตุ: \"จำนวนครั้ง\" = จำนวนวันที่นักศึกษาลงเวลาในระบบ (1 วัน = 1 ครั้ง ต่อวิชา/ตอน) · \"วันในเอกสาร\" = จำนวนวันใน Work time sheet หลังกระจายชั่วโมงเบิกได้ไม่เกิน 8 ชม./วัน (มีเฉพาะวิชา/เดือนที่ยืนยันแล้ว) · " +
    "\"งบวิชา\" คือค่าใช้จ่ายคาดการณ์ของวิชา/ตอนนั้นทั้งเทอม (นับครั้งเดียวในแถวรวมของแต่ละคน)";
  note.font = f14({ italic: true, size: 12 });
  note.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 36;
  ws.pageSetup.printArea = `A1:${LAST}${r}`;
  ws.pageSetup.printTitlesRow = `${HR}:${HR}`;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
