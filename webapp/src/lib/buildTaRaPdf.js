import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { TH_MONTHS } from "@/lib/constants";
import { bahtText } from "@/lib/bahtText";
import { fmtDateTaRa, deriveLevelAndProgram } from "@/lib/buildTaRaXlsx";
import { LAKSAMAN_REGULAR_B64, LAKSAMAN_BOLD_B64 } from "@/lib/fontsData";
import { wrapTextLines } from "@/lib/textWrap";

const round2 = (n) => Math.round(n * 100) / 100;
const num = (n, dp = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// "แบบใบเบิกค่าตอบแทนทุนผู้ช่วยสอน" (TA/RA) as a PDF — A4 landscape.
// `title` overrides the first line (TOR/จ้างเหมา reuses this template).
export async function buildTaRaPdf({ user, month, displayRows, title }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(LAKSAMAN_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LAKSAMAN_BOLD_B64, "base64"), { subset: true });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  const PAGE_W = 841.89; // A4 landscape
  const PAGE_H = 595.28;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const black = rgb(0, 0, 0);

  const cols = [
    { label: "ชื่อผู้สอน", w: 150, align: "left" },
    { label: "วันเดือนปีที่สอน", w: 95, align: "center" },
    { label: "กระบวนวิชา", w: 80, align: "center" },
    { label: "จำนวน\nชั่วโมงที่สอน", w: 85, align: "center" },
    { label: "ค่าสอน\nชั่วโมงละ", w: 80, align: "center" },
    { label: "รวมจำนวน\nเงินค่าสอน", w: 90, align: "center" },
    { label: "ผู้รับเงิน", w: 95, align: "center" },
    { label: "หมายเหตุ", w: 0, align: "center" },
  ];
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols[cols.length - 1].w = CONTENT_W - fixed;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const tw = (s, f, size) => f.widthOfTextAtSize(String(s ?? ""), size);
  const text = (s, x, yy2, size, f) => page.drawText(String(s ?? ""), { x, y: yy2, size, font: f, color: black });
  const centered = (s, cx, yy2, size, f) => text(s, cx - tw(s, f, size) / 2, yy2, size, f);

  // Break a string into lines that fit within maxW, at Thai word boundaries.
  const wrapLines = (s, f, size, maxW) => wrapTextLines(s, maxW, (t) => tw(t, f, size));

  // ---- Title ----
  centered(title || "แบบใบเบิกค่าตอบแทนทุนผู้ช่วยสอน", PAGE_W / 2, y - 14, 14, bold);
  y -= 20;
  centered("วิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่", PAGE_W / 2, y - 12, 11, bold);
  y -= 18;
  centered(`ประจำเดือน ${monthLabel}`, PAGE_W / 2, y - 12, 11, bold);
  y -= 30;

  // ---- ระดับ / หลักสูตร checkboxes (auto-ticked from course code + section) ----
  // The Thai font has no ☐/☑ glyph, so draw the box (and tick) with vectors.
  const { graduate, program } = deriveLevelAndProgram(displayRows);
  const BOX = 9;
  const checkbox = (x, baseY, checked) => {
    page.drawRectangle({
      x, y: baseY - 1, width: BOX, height: BOX,
      borderColor: black, borderWidth: 0.8,
    });
    if (checked) {
      page.drawLine({
        start: { x: x + 1.6, y: baseY + 3.4 }, end: { x: x + 3.6, y: baseY + 0.9 },
        thickness: 1.3, color: black,
      });
      page.drawLine({
        start: { x: x + 3.6, y: baseY + 0.9 }, end: { x: x + 7.6, y: baseY + 6.6 },
        thickness: 1.3, color: black,
      });
    }
  };
  const option = (x, baseY, label, checked) => {
    checkbox(x, baseY, checked);
    text(label, x + BOX + 6, baseY, 10, font);
  };

  const lx = MARGIN + 110;
  const rx = MARGIN + 380;
  text("ระดับ", lx - 55, y - 10, 10, font);
  option(lx, y - 10, "บัณฑิตศึกษา", graduate === true);
  option(lx, y - 26, "ปริญญาตรี", graduate === false);
  text("หลักสูตร", rx - 62, y - 10, 10, font);
  option(rx, y - 10, "ภาคปกติ", program === "normal");
  option(rx, y - 26, "ภาคพิเศษ", program === "special");
  option(rx, y - 42, "นานาชาติ", program === "inter");
  y -= 60;

  // ---- Table ----
  const HROW = 32;
  const ROW = 20;       // minimum (single-line) data-row height
  const PAD = 5;        // horizontal padding inside a cell
  const LINE_H = 11;    // line spacing for wrapped text
  const PAD_V = 4;      // vertical padding inside a wrapped cell
  const colX = (i) => {
    let x = MARGIN;
    for (let k = 0; k < i; k++) x += cols[k].w;
    return x;
  };
  const grid = (topY, h) => {
    page.drawLine({ start: { x: MARGIN, y: topY }, end: { x: MARGIN + CONTENT_W, y: topY }, thickness: 0.7, color: black });
    page.drawLine({ start: { x: MARGIN, y: topY - h }, end: { x: MARGIN + CONTENT_W, y: topY - h }, thickness: 0.7, color: black });
    for (let i = 0; i <= cols.length; i++) {
      const x = i === cols.length ? MARGIN + CONTENT_W : colX(i);
      page.drawLine({ start: { x, y: topY }, end: { x, y: topY - h }, thickness: 0.7, color: black });
    }
  };
  // wrapped lines a value needs in column i (for row-height measurement)
  const cellLines = (i, s, size) => wrapLines(s, font, size, cols[i].w - PAD * 2);
  const cell = (i, s, topY, h, f, size) => {
    const c = cols[i];
    const lines = wrapLines(s, f, size, c.w - PAD * 2);
    const BH = size + (lines.length - 1) * LINE_H;     // visual block height
    const firstBase = topY - size - (h - BH) / 2 + 1;  // vertically centered
    lines.forEach((ln, k) => {
      const yy = firstBase - k * LINE_H;
      if (c.align === "left") text(ln, colX(i) + PAD, yy, size, f);
      else centered(ln, colX(i) + c.w / 2, yy, size, f);
    });
  };

  // table header (supports the 2-line labels) — redrawn at the top of each page
  const drawTableHeader = () => {
    grid(y, HROW);
    cols.forEach((c, i) => {
      const parts = c.label.split("\n");
      if (parts.length === 1) {
        centered(parts[0], colX(i) + c.w / 2, y - HROW / 2 - 3, 9.5, bold);
      } else {
        centered(parts[0], colX(i) + c.w / 2, y - 13, 9.5, bold);
        centered(parts[1], colX(i) + c.w / 2, y - 25, 9.5, bold);
      }
    });
    y -= HROW;
  };
  drawTableHeader();

  const fullName = `${user.title || ""}${user.full_name}`.trim();
  const rows = displayRows || [];
  let total = 0;

  // footer block (total row + signature grid) reserve. The true block is
  // ROW+26+98=144, but we reserve slightly less so an 11th row fits on page 1
  // (the total row + signature simply sit a little lower on the page).
  const FOOTER_H = ROW + 26 + (24 + 4 * 17 + 6) - 12; // 132
  const DATA_BOTTOM = MARGIN + 30; // lowest a data row may reach

  // Height a record needs = tallest wrapped cell in that row.
  const rowHeight = (e) => {
    const sec = e.section || {};
    const specs = [
      [0, fullName, 9.5],
      [1, fmtDateTaRa(e.work_date), 9.5],
      [2, sec.course?.code || "", 9.5],
      [3, e.hours, 9.5],
      [4, num(e.rate), 9.5],
      [5, num(e.money), 9.5],
      [7, e.remark || "", 9],
    ];
    let lines = 1;
    for (const [i, s, size] of specs) lines = Math.max(lines, cellLines(i, s, size).length);
    return Math.max(ROW, lines * LINE_H + PAD_V * 2);
  };

  rows.forEach((e) => {
    const rh = rowHeight(e);
    if (y - rh < DATA_BOTTOM) {
      // continuation page: repeat the table header
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawTableHeader();
    }
    const sec = e.section || {};
    total = round2(total + Number(e.money || 0));
    grid(y, rh);
    cell(0, fullName, y, rh, font, 9.5);
    cell(1, fmtDateTaRa(e.work_date), y, rh, font, 9.5);
    cell(2, sec.course?.code || "", y, rh, font, 9.5);
    cell(3, e.hours, y, rh, font, 9.5);
    cell(4, num(e.rate), y, rh, font, 9.5);
    cell(5, num(e.money), y, rh, font, 9.5);
    cell(7, e.remark || "", y, rh, font, 9);
    y -= rh;
  });

  // keep the total row + signature block together on one page
  if (y - FOOTER_H < MARGIN) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawTableHeader();
  }
  // pad with blank ruled rows so the total row sits near the page bottom
  while (y - ROW - FOOTER_H >= MARGIN) {
    grid(y, ROW);
    y -= ROW;
  }

  // ---- Total row (merged cells: A–C label | D–E amount | F–H baht text) ----
  const RIGHT = MARGIN + CONTENT_W;
  const yB = y - ROW;
  // grey #F2F2F2 background band
  page.drawRectangle({
    x: MARGIN, y: yB, width: CONTENT_W, height: ROW,
    color: rgb(0xf2 / 255, 0xf2 / 255, 0xf2 / 255),
  });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.7, color: black });
  page.drawLine({ start: { x: MARGIN, y: yB }, end: { x: RIGHT, y: yB }, thickness: 0.7, color: black });
  // only the merge boundaries get a vertical rule
  [MARGIN, colX(3), colX(5), RIGHT].forEach((x) =>
    page.drawLine({ start: { x, y }, end: { x, y: yB }, thickness: 0.7, color: black })
  );

  const baseY = yB + (ROW - 10) / 2 + 1;
  const tLabel = "รวมจำนวนเงินที่ขอเบิก";
  text(tLabel, colX(3) - PAD - tw(tLabel, bold, 10), baseY, 10, bold);
  const amt = num(total, 2);
  text(amt, colX(5) - PAD - tw(amt, bold, 10), baseY, 10, bold);
  centered(bahtText(total), (colX(5) + RIGHT) / 2, baseY, 10, font);
  y -= ROW + 26;

  // ---- Signature footer: 4 boxed blocks, aligned to the columns above ----
  //   col 0 | cols 1–3 | cols 4–5 | cols 6–7
  const blocks = [
    { from: 0, to: 1, label: "ผู้จัดทำ/ผู้ตรวจสอบ" },
    { from: 1, to: 4, label: "หัวหน้าภาควิชาหรือตำแหน่งอื่นที่เทียบเท่า" },
    { from: 4, to: 6, label: "ผู้อนุมัติ" },
    { from: 6, to: 8, label: "ผู้จ่ายเงิน" },
  ];
  const edge = (i) => (i >= cols.length ? MARGIN + CONTENT_W : colX(i));
  const FH = 24; // label row height
  const LSIZE = 9;
  const kinds = ["sign", "paren", "role", "date"];
  const boxH = FH + kinds.length * 17 + 6;

  // Grow the dotted line to (almost) fill the block width, measured precisely.
  const dotLine = (kind, bw) => {
    const target = bw - 10; // small side padding
    if (kind === "paren") {
      let dots = "";
      while (tw(`(${dots}.)`, font, LSIZE) <= target) dots += ".";
      return `(${dots})`;
    }
    const prefix = kind === "sign" ? "ลงชื่อ " : kind === "role" ? "ตำแหน่ง " : "วันที่ ";
    let dots = "";
    while (tw(prefix + dots + ".", font, LSIZE) <= target) dots += ".";
    return prefix + dots;
  };

  page.drawRectangle({ x: MARGIN, y: y - boxH, width: CONTENT_W, height: boxH, borderColor: black, borderWidth: 0.7 });
  // dividers sit exactly on the table's column boundaries
  blocks.slice(1).forEach((b) => {
    const x = edge(b.from);
    page.drawLine({ start: { x, y }, end: { x, y: y - boxH }, thickness: 0.7, color: black });
  });
  page.drawLine({ start: { x: MARGIN, y: y - FH }, end: { x: MARGIN + CONTENT_W, y: y - FH }, thickness: 0.7, color: black });

  blocks.forEach((b) => {
    const x1 = edge(b.from);
    const x2 = edge(b.to);
    const cx = (x1 + x2) / 2;
    const bw = x2 - x1;
    const size = tw(b.label, bold, 9.5) > bw - 8 ? 7.5 : 9.5;
    centered(b.label, cx, y - FH / 2 - 3, size, bold);
    kinds.forEach((kind, k) => {
      centered(dotLine(kind, bw), cx, y - FH - 14 - k * 17, LSIZE, font);
    });
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
