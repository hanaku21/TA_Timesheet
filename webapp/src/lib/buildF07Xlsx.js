import { TH_MONTHS } from "@/lib/constants";
import { bahtText } from "@/lib/bahtText";
import { toRate } from "@/lib/calc";

// แบบฟอร์ม F-07 "หลักฐานการจ่ายค่าตอบแทนนักศึกษาช่วยงาน" (ใบสรุปเบิกรายเดือน)
//   level "grad" → นักศึกษาระดับบัณฑิตศึกษา (TA/RA)  — ชั่วโมงจริง × อัตราของ section
//   level "ug"   → นักศึกษาระดับปริญญาตรี (ทุน ป.ตรี) — ชั่วโมงที่แปลงแล้ว × อัตราทุน (50 ฿)
//   level "tor"  → จ้างเหมา — one block per เลข TOR (a person with several TORs gets several blocks),
//                  "รหัส" column shows the TOR number, real hours × section rate
// Layout follows the office's Excel template: one block per student (one row per
// course), merged cells across the block, total row + amount in words, and the
// 4-signature footer. Repeats the title + table header on each printed page.

const FONT = "TH SarabunPSK";
const round2 = (n) => Math.round(n * 100) / 100;
const thin = { style: "thin", color: { argb: "FF000000" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const f14 = (extra = {}) => ({ name: FONT, size: 14, ...extra });

const COLS = [6.6, 22.4, 12.7, 22.6, 26.6, 11.1, 9.4, 10.1, 11.4, 18.9, 16.4]; // A..K
const LAST = "K";
const ROWS_PER_PAGE = 12; // data rows before we repeat the header on a new page

// Thai fiscal year (1 Oct – 30 Sep): Oct 2026 → ปีงบประมาณ 2570
function fiscalYearBE(yy, mm) {
  return yy + 543 + (mm >= 10 ? 1 : 0);
}

// units: [{ user, section, days, hours, cost, convHours, convMoney }] (already aggregated per user×section)
// -> [{ user, rate, courses: [{ label, hours, days }], hours, days }] grouped per student (and per rate).
// One row per section; a course that appears in several sections is written as
// "960201 ตอน 001" / "960201 ตอน 002" on separate rows (single-section courses show the code only).
function buildBlocks(units, level, scholarshipRate) {
  const byUser = new Map();
  for (const u of units) {
    const rate = level === "ug" ? scholarshipRate : toRate(u.section?.rate);
    const tor = level === "tor" ? (u.section?.tor_number || u.user?.tor_number || "") : null;
    const key = level === "tor" ? `${u.user.id}|${tor}|${rate}` : `${u.user.id}|${rate}`;
    if (!byUser.has(key)) byUser.set(key, { user: u.user, rate, tor, rows: [], hours: 0, days: 0 });
    const g = byUser.get(key);
    const hours = level === "ug" ? Number(u.convHours || 0) : Number(u.hours || 0);
    g.rows.push({ code: u.section?.course?.code || "", section: u.section?.section || "", hours: round2(hours), days: u.days });
    g.hours = round2(g.hours + hours);
    g.days += u.days;
  }
  const blocks = [...byUser.values()].map((g) => {
    const perCode = {};
    g.rows.forEach((r) => (perCode[r.code] = (perCode[r.code] || 0) + 1));
    const courses = g.rows
      .sort((a, b) => a.code.localeCompare(b.code) || a.section.localeCompare(b.section))
      .map((r) => ({ ...r, label: perCode[r.code] > 1 ? `${r.code} ตอน ${r.section}` : r.code }));
    return { ...g, courses };
  });
  blocks.sort((a, b) =>
    (level === "tor" ? String(a.tor || "").localeCompare(String(b.tor || ""), undefined, { numeric: true }) : 0) ||
    (a.user.full_name || "").localeCompare(b.user.full_name || "", "th") || a.rate - b.rate);
  return blocks.filter((b) => b.hours > 0);
}

export function addF07Sheet(wb, { level, units, month, term, scholarshipRate = 50, f07 = {}, sheetName }) {
  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;
  const termLabel = String(term || "").includes("/") ? term.split("/").reverse().join("/") : term; // "2569/1" -> "1/2569"
  const isUg = level === "ug";
  const isTor = level === "tor";
  const noticeDate = (isTor ? f07.noticeDateTor : isUg ? f07.noticeDateUg : f07.noticeDateGrad) || "";
  const levelText = isUg ? "นักศึกษาระดับปริญญาตรี" : "นักศึกษาระดับบัณฑิตศึกษา(ปริญญาโทหรือปริญญาเอก)";
  const title1 = isTor
    ? `หลักฐานการจ่ายค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน ประจำปีงบประมาณ ${fiscalYearBE(yy, mm)}`
    : `หลักฐานการจ่ายค่าตอบแทนนักศึกษาช่วยงาน ประจำปีงบประมาณ ${fiscalYearBE(yy, mm)}`;
  const title2 = isTor
    ? `เบิกเงินตามสัญญาจ้างเหมาผู้ช่วยสอน (TOR) ประจำภาคการศึกษา ${termLabel}` + (noticeDate ? ` ลงวันที่ ${noticeDate}` : "")
    : `เบิกเงินตามประกาศรายชื่อ${levelText}ที่ได้รับทุนผู้ช่วยสอน (TA)ประจำภาคการศึกษา ${termLabel}` + (noticeDate ? ` ลงวันที่ ${noticeDate}` : "");
  const idHeader = isTor ? "เลข TOR" : "รหัส";
  const wordsPrefix = isTor ? "ค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน" : "ค่าตอบแทนนักศึกษา";

  const ws = wb.addWorksheet(sheetName || (isTor ? "F-07 จ้างเหมา" : isUg ? "F-07 ป.ตรี" : "F-07 บัณฑิต"), {
    pageSetup: {
      paperSize: 9, orientation: "landscape", scale: 80, fitToPage: false,
      margins: { left: 0.25, right: 0.25, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = COLS.map((w) => ({ width: w }));

  const blocks = buildBlocks(units, level, scholarshipRate);
  let r = 1;
  const dataRowIdx = []; // rows carrying a จำนวนเงิน formula (for the SUM)

  const writeTitle = (withStatement) => {
    const lines = [
      title1,
      title2,
      "ฏีกาเงินรายได้ประจำปี.................................................................................เลขที่............................................ ลงวันที่...........................................",
      `ประจำเดือน ${monthLabel}`,
    ];
    const heights = [23.25, 26.25, 24, 24.75];
    lines.forEach((txt, i) => {
      ws.mergeCells(`A${r}:${LAST}${r}`);
      const c = ws.getCell(`A${r}`);
      c.value = txt;
      c.font = f14({ bold: true });
      c.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(r).height = heights[i];
      r++;
    });
    if (withStatement) {
      const c = ws.getCell(`B${r}`);
      c.value = "ข้าพเจ้าผู้มีนามท้ายนี้ได้รับเงินจากวิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ ไปเป็นการถูกต้องแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญ";
      c.font = f14();
      ws.getRow(r).height = 27.75;
      r++;
    }
    const headers = ["ลำดับที่", "ชื่อ-สกุล", idHeader, "กระบวนวิชา", "ว/ด/ป ที่ปฏิบัติงาน", "จำนวนชั่วโมง",
      "จำนวนครั้ง", "อัตรา/ชม.", "จำนวนเงิน", "ลายมือชื่อผู้รับเงิน", "ว/ด/ป ที่รับเงิน"];
    const hr = ws.getRow(r);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = f14();
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = box;
    });
    hr.height = 24;
    r++;
  };

  writeTitle(true);
  let rowsOnPage = 0;

  blocks.forEach((b, idx) => {
    const n = Math.max(1, b.courses.length);
    // new page: repeat title + header (no statement line on later pages, as in the template)
    if (rowsOnPage > 0 && rowsOnPage + n > ROWS_PER_PAGE) {
      ws.getRow(r - 1).addPageBreak();
      writeTitle(false);
      rowsOnPage = 0;
    }
    const top = r;
    const bottom = r + n - 1;
    const fullName = `${b.user.title || ""} ${b.user.full_name}`.trim();
    const studentId = isTor
      ? (b.tor || "")
      : b.user.student_id ? (/^\d+$/.test(b.user.student_id) ? Number(b.user.student_id) : b.user.student_id) : "";

    for (let k = 0; k < n; k++) {
      const row = ws.getRow(r);
      const course = b.courses[k];
      if (k === 0) {
        row.getCell(1).value = idx + 1;
        row.getCell(2).value = fullName;
        row.getCell(3).value = studentId;
        row.getCell(5).value = monthLabel;
        row.getCell(6).value = b.hours;
        row.getCell(7).value = b.days;
        row.getCell(8).value = b.rate;
        row.getCell(9).value = { formula: `F${top}*H${top}`, result: round2(b.hours * b.rate) };
        dataRowIdx.push(top);
      }
      row.getCell(4).value = course ? course.label : "";
      for (let i = 1; i <= 11; i++) {
        const c = row.getCell(i);
        c.font = f14();
        c.border = box;
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: i === 2 };
      }
      row.height = 28.5;
      r++;
    }
    if (n > 1) {
      for (const col of ["A", "B", "C", "E", "F", "G", "H", "I", "J", "K"]) {
        ws.mergeCells(`${col}${top}:${col}${bottom}`);
      }
    }
    rowsOnPage += n;
  });

  if (blocks.length === 0) {
    ws.mergeCells(`A${r}:${LAST}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = "— ไม่มีรายการที่ยืนยันนำส่งของประเภทนี้ในเดือนนี้ —";
    c.font = f14({ italic: true });
    c.alignment = { horizontal: "center" };
    for (let i = 1; i <= 11; i++) ws.getRow(r).getCell(i).border = box;
    r++;
  }

  // ---- total row ----
  const total = round2(blocks.reduce((a, b) => a + b.hours * b.rate, 0));
  const tr = ws.getRow(r);
  tr.getCell(8).value = "รวมเป็นเงิน";
  tr.getCell(8).font = f14();
  tr.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
  const sumCell = tr.getCell(9);
  sumCell.value = dataRowIdx.length
    ? { formula: `SUM(I${dataRowIdx[0]}:I${dataRowIdx[dataRowIdx.length - 1]})`, result: total }
    : 0;
  sumCell.font = f14();
  sumCell.numFmt = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';
  sumCell.alignment = { horizontal: "right", vertical: "middle" };
  sumCell.border = box;
  tr.height = 27;
  r++;

  const words = ws.getCell(`B${r}`);
  words.value = `${wordsPrefix} เดือน ${monthLabel} รวมเป็นเงินทั้งสิ้น ${bahtText(total)}`;
  words.font = f14();
  ws.getRow(r).height = 19.5;
  r += 3;

  // ---- signatures ----
  const put = (addr, txt, align) => {
    const c = ws.getCell(addr);
    c.value = txt;
    c.font = f14();
    if (align) c.alignment = { horizontal: align, vertical: "middle" };
  };
  put(`H${r}`, "ลงชื่อ....................................................ผู้จ่ายเงิน");
  put(`H${r + 1}`, "(.....................................................................)");
  r += 4;
  put(`B${r}`, "ลงชื่อ....................................ผู้จัดทำ");
  put(`D${r}`, "ลงชื่อ.............................................ผู้รับรอง");
  put(`H${r}`, "ลงชื่อ....................................................ผู้อนุมัติ");
  r++;
  put(`B${r}`, f07.preparer ? `(${f07.preparer})` : "(.....................................................................)", "center");
  put(`D${r}`, f07.certifier ? `(${f07.certifier})` : "(.....................................................................)", "center");
  put(`H${r}`, "(.....................................................................)");
  r++;
  put(`A${r}`, "หมายเหตุ  ให้แนบหนังสือขออนุมัติประกอบการเบิกจ่ายเงิน");

  ws.pageSetup.printArea = `A1:${LAST}${r}`;
  return ws;
}
