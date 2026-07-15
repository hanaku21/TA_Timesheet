import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { EMP_LABELS, TH_MONTHS } from "@/lib/constants";
import { LAKSAMAN_REGULAR_B64, LAKSAMAN_BOLD_B64 } from "@/lib/fontsData";

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Build a monthly reimbursement-form PDF for one user (A4 landscape),
// mirroring the .xlsx layout: title, term/month, person info, optional
// scholarship note, table, totals row, and a 4-column signature footer.
// displayRows: precomputed rows (each with `section`, work_date, hours, rate, money, remark)
export async function buildTimesheetPdf({ user, month, payConfig, displayRows }) {
  const RATE = payConfig?.rate || 50;
  const MAXH = payConfig?.maxHours || 8;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(LAKSAMAN_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LAKSAMAN_BOLD_B64, "base64"), { subset: true });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  // A4 landscape
  const PAGE_W = 841.89;
  const PAGE_H = 595.28;
  const MARGIN = 28;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const gray = rgb(0.6, 0.6, 0.6);
  const black = rgb(0.1, 0.1, 0.1);
  const headerFill = rgb(0.93, 0.91, 0.996);

  // Column layout (proportions sum to CONTENT_W)
  const cols = [
    { key: "no", label: "ลำดับ", w: 34, align: "center" },
    { key: "code", label: "รหัสวิชา", w: 62, align: "center" },
    { key: "sec", label: "Section", w: 52, align: "center" },
    { key: "cur", label: "หลักสูตร", w: 58, align: "center" },
    { key: "name", label: "ชื่อ-นามสกุล", w: 150, align: "left" },
    { key: "date", label: "วันที่", w: 74, align: "center" },
    { key: "hours", label: "จำนวนชั่วโมง", w: 66, align: "center" },
    { key: "rate", label: "เงิน/ชม.", w: 66, align: "right" },
    { key: "total", label: "รวมเป็นเงิน", w: 72, align: "right" },
    { key: "remark", label: "หมายเหตุ", w: 110, align: "left" },
    { key: "sign", label: "ลายเซ็นผู้ช่วยสอน", w: 0, align: "center" },
  ];
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols[cols.length - 1].w = Math.max(90, CONTENT_W - fixed);

  let doc_page = doc.addPage([PAGE_W, PAGE_H]);
  let page = doc_page;
  let y = PAGE_H - MARGIN;

  const textW = (s, f, size) => f.widthOfTextAtSize(String(s ?? ""), size);
  function drawText(p, s, x, yy2, size, f, color = black) {
    p.drawText(String(s ?? ""), { x, y: yy2, size, font: f, color });
  }
  function drawCentered(p, s, cx, yy2, size, f, color = black) {
    drawText(p, s, cx - textW(s, f, size) / 2, yy2, size, f, color);
  }

  // ---- Title ----
  const title =
    user.employment_type === "TOR"
      ? "แบบใบเบิกค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน"
      : "แบบใบเบิกค่าตอบแทนทุนนักศึกษาผู้ช่วยสอน";
  drawCentered(page, title, PAGE_W / 2, y - 16, 16, bold);
  y -= 24;
  drawCentered(page, `ภาคการศึกษา 2569/1   ประจำเดือน ${monthLabel}`, PAGE_W / 2, y - 12, 12, font);
  y -= 26;

  // ---- Person info ----
  drawText(page, `ชื่อ-นามสกุล: ${user.title || ""} ${user.full_name}`, MARGIN, y - 11, 11, font);
  const infoRight =
    `ประเภทการจ้าง: ${EMP_LABELS[user.employment_type] || user.employment_type}` +
    (user.tor_number ? `   เลข TOR: ${user.tor_number}` : "") +
    (user.student_id ? `   รหัสนักศึกษา: ${user.student_id}` : "");
  drawText(page, infoRight, MARGIN + CONTENT_W / 2, y - 11, 11, font);
  y -= 20;

  if (user.employment_type === "SCHOLARSHIP") {
    drawText(
      page,
      `หมายเหตุ: คิดค่าตอบแทนที่อัตรา ${RATE} บาท/ชั่วโมง (แปลงจากยอดเงินจริงต่อวัน) ไม่เกิน ${MAXH} ชั่วโมง/วัน ส่วนที่เกินทบไปวันถัดไป`,
      MARGIN, y - 10, 9.5, font, rgb(0.42, 0.45, 0.5)
    );
    y -= 16;
  }

  // ---- Table geometry helpers ----
  const HROW = 26; // header row height
  const ROW = 20;
  const PAD = 4;
  function colX(i) {
    let x = MARGIN;
    for (let k = 0; k < i; k++) x += cols[k].w;
    return x;
  }
  function drawRowGrid(p, topY, h) {
    // horizontal lines
    p.drawLine({ start: { x: MARGIN, y: topY }, end: { x: MARGIN + CONTENT_W, y: topY }, thickness: 0.5, color: gray });
    p.drawLine({ start: { x: MARGIN, y: topY - h }, end: { x: MARGIN + CONTENT_W, y: topY - h }, thickness: 0.5, color: gray });
    // vertical lines
    for (let i = 0; i <= cols.length; i++) {
      const x = i === cols.length ? MARGIN + CONTENT_W : colX(i);
      p.drawLine({ start: { x, y: topY }, end: { x, y: topY - h }, thickness: 0.5, color: gray });
    }
  }
  function cellText(p, i, s, rowTopY, h, f, size) {
    const c = cols[i];
    const x0 = colX(i);
    const yText = rowTopY - h + (h - size) / 2 + 1;
    if (c.align === "center") drawCentered(p, s, x0 + c.w / 2, yText, size, f);
    else if (c.align === "right") drawText(p, s, x0 + c.w - PAD - textW(s, f, size), yText, size, f);
    else {
      // left, with naive truncation to fit
      let str = String(s ?? "");
      const maxW = c.w - PAD * 2;
      while (str.length > 1 && textW(str, f, size) > maxW) str = str.slice(0, -1);
      if (str !== String(s ?? "")) str = str.slice(0, -1) + "…";
      drawText(p, str, x0 + PAD, yText, size, f);
    }
  }

  function drawHeader(p, topY) {
    // fill
    p.drawRectangle({ x: MARGIN, y: topY - HROW, width: CONTENT_W, height: HROW, color: headerFill });
    drawRowGrid(p, topY, HROW);
    cols.forEach((c, i) => cellText(p, i, c.label, topY, HROW, bold, 9.5));
  }

  // ---- Table header ----
  drawHeader(page, y);
  y -= HROW;

  // ---- Data rows (with pagination) ----
  let totalHours = 0;
  let totalMoney = 0;
  const bottomLimit = MARGIN + 150; // leave room for footer on last page
  displayRows.forEach((e, idx) => {
    if (y - ROW < MARGIN + 40) {
      // new page (data continuation)
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader(page, y);
      y -= HROW;
    }
    const sec = e.section || {};
    const h = e.hours;
    const rt = e.rate;
    const mo = e.money;
    totalHours = round2(totalHours + h);
    totalMoney = round2(totalMoney + mo);
    drawRowGrid(page, y, ROW);
    cellText(page, 0, idx + 1, y, ROW, font, 9.5);
    cellText(page, 1, sec.course?.code || "", y, ROW, font, 9.5);
    cellText(page, 2, sec.section || "", y, ROW, font, 9.5);
    cellText(page, 3, sec.curriculum?.code || "", y, ROW, font, 9.5);
    cellText(page, 4, user.full_name, y, ROW, font, 9.5);
    cellText(page, 5, e.work_date, y, ROW, font, 9.5);
    cellText(page, 6, h, y, ROW, font, 9.5);
    cellText(page, 7, money(rt), y, ROW, font, 9.5);
    cellText(page, 8, money(mo), y, ROW, font, 9.5);
    cellText(page, 9, e.remark || "", y, ROW, font, 9.5);
    // signature cell left blank
    y -= ROW;
  });

  // ---- Totals row ----
  if (y - ROW < MARGIN + 40) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }
  drawRowGrid(page, y, ROW);
  // merge first 6 cols visually for the label: just draw label right-aligned in col 5 area
  const labelRightX = colX(6) - PAD;
  drawText(page, `รวม ${displayRows.length} รายการ`, labelRightX - textW(`รวม ${displayRows.length} รายการ`, bold, 10), y - ROW + (ROW - 10) / 2 + 1, 10, bold);
  cellText(page, 6, round2(totalHours), y, ROW, bold, 10);
  cellText(page, 8, money(round2(totalMoney)), y, ROW, bold, 10);
  y -= ROW + 24;

  // ---- Signature footer: 4 columns ----
  if (y < MARGIN + 110) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 20;
  }
  const blocks = [
    "ผู้จัดทำ/ผู้ตรวจสอบ",
    "หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า",
    "ผู้อนุมัติ",
    "ผู้จ่ายเงิน",
  ];
  const bw = CONTENT_W / 4;
  blocks.forEach((label, i) => {
    const cx = MARGIN + bw * i + bw / 2;
    // wrap the long department label onto two lines if needed
    let ly = y;
    if (textW(label, bold, 10.5) > bw - 8) {
      const words = label.split("หรือ");
      drawCentered(page, words[0] + "หรือ", cx, ly - 11, 10.5, bold);
      drawCentered(page, words[1] || "", cx, ly - 24, 10.5, bold);
      ly -= 13;
    } else {
      drawCentered(page, label, cx, ly - 11, 10.5, bold);
    }
    const lines = [
      "ลงชื่อ ..............................................",
      "(..............................................)",
      "ตำแหน่ง ..........................................",
      "วันที่ ......./......./.......",
    ];
    lines.forEach((txt, k) => drawCentered(page, txt, cx, ly - 34 - k * 18, 10, font));
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
