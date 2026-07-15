import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { TH_MONTHS } from "@/lib/constants";
import { computeWorkTimeRows } from "@/lib/workTimeSheet";
import { LAKSAMAN_REGULAR_B64, LAKSAMAN_BOLD_B64 } from "@/lib/fontsData";

// "Work time sheet TA Student (CMU Rate)" as a PDF (A4 portrait).
// The DD/MM/YY and Course (Key) cells are visually merged across the rows of a
// day-group (no inner horizontal rule, text centred over the whole group) —
// matching the .xlsx merged cells.
export async function buildWorkTimeSheetPdf({ user, month, displayRows }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(LAKSAMAN_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LAKSAMAN_BOLD_B64, "base64"), { subset: true });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  const PAGE_W = 595.28; // A4 portrait
  const PAGE_H = 841.89;
  const MARGIN = 32;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const black = rgb(0, 0, 0);
  const headerFill = rgb(0.85, 0.85, 0.85);

  const cols = [
    { key: "date", label: "DD/MM/YYYY", w: 66 },
    { key: "in", label: "Time In", w: 48 },
    { key: "sign1", label: "Worker's signature", w: 82 },
    { key: "out", label: "Time Out", w: 50 },
    { key: "sign2", label: "Worker's signature", w: 82 },
    { key: "hours", label: "Hours/Record", w: 62 },
    { key: "course", label: "Course (Key)", w: 72 },
    { key: "detail", label: "Work Detail", w: 0 },
  ];
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols[cols.length - 1].w = CONTENT_W - fixed;

  const DATE_COL = 0;
  const COURSE_COL = 6;

  const rows = computeWorkTimeRows(displayRows);

  const tw = (s, f, size) => f.widthOfTextAtSize(String(s ?? ""), size);
  const text = (p, s, x, yv, size, f) => p.drawText(String(s ?? ""), { x, y: yv, size, font: f, color: black });
  const centered = (p, s, cx, yv, size, f) => text(p, s, cx - tw(s, f, size) / 2, yv, size, f);

  const colX = (i) => {
    let x = MARGIN;
    for (let k = 0; k < i; k++) x += cols[k].w;
    return x;
  };
  const hLine = (p, x1, x2, yv) =>
    p.drawLine({ start: { x: x1, y: yv }, end: { x: x2, y: yv }, thickness: 0.6, color: black });
  const vLine = (p, x, y1, y2) =>
    p.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.6, color: black });

  const HROW = 24;
  const ROW = 17;

  const page0 = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ---- Title ----
  centered(page0, "Work time sheet TA Student (CMU Rate)", PAGE_W / 2, y - 16, 14, bold);
  y -= 34;
  centered(page0, monthLabel, PAGE_W / 2, y - 12, 12, bold);
  y -= 32;

  // ---- Fullname / Student ID ----
  text(page0, "Fullname", MARGIN, y - 11, 10, bold);
  text(page0, `${user.title || ""} ${user.full_name}`.trim(), MARGIN + 75, y - 11, 10, font);
  text(page0, "Student ID", MARGIN + CONTENT_W - 190, y - 11, 10, bold);
  text(page0, user.student_id || "", MARGIN + CONTENT_W - 100, y - 11, 10, font);
  y -= 26;

  // ---- Layout pass: assign every row a page + top-y ----
  const BOTTOM_LIMIT = MARGIN + 30;
  const headerTop = [y]; // header top-y per page
  const placed = [];
  let p = 0;
  let ry = y - HROW;
  for (const row of rows) {
    if (ry - ROW < BOTTOM_LIMIT) {
      p += 1;
      headerTop[p] = PAGE_H - MARGIN;
      ry = headerTop[p] - HROW;
    }
    placed.push({ row, page: p, yTop: ry });
    ry -= ROW;
  }
  const pages = [page0];
  for (let i = 1; i <= p; i++) pages.push(doc.addPage([PAGE_W, PAGE_H]));

  // ---- Table headers ----
  const drawHeader = (pg, topY) => {
    pg.drawRectangle({ x: MARGIN, y: topY - HROW, width: CONTENT_W, height: HROW, color: headerFill });
    hLine(pg, MARGIN, MARGIN + CONTENT_W, topY);
    hLine(pg, MARGIN, MARGIN + CONTENT_W, topY - HROW);
    for (let i = 0; i <= cols.length; i++) {
      vLine(pg, i === cols.length ? MARGIN + CONTENT_W : colX(i), topY, topY - HROW);
    }
    cols.forEach((c, i) => {
      const size = c.label.length > 14 ? 6.5 : 7.5;
      centered(pg, c.label, colX(i) + c.w / 2, topY - HROW / 2 - size / 2 + 1, size, bold);
    });
  };
  for (let i = 0; i < pages.length; i++) drawHeader(pages[i], headerTop[i]);

  // ---- Row cells (non-merged columns) + vertical rules ----
  let total = 0;
  placed.forEach(({ row, page: pi, yTop }) => {
    const pg = pages[pi];
    const yB = yTop - ROW;
    for (let i = 0; i <= cols.length; i++) {
      vLine(pg, i === cols.length ? MARGIN + CONTENT_W : colX(i), yTop, yB);
    }
    const put = (i, s, size = 8) =>
      centered(pg, s, colX(i) + cols[i].w / 2, yB + (ROW - size) / 2 + 1, size, font);
    put(1, row.timeIn);
    put(3, row.timeOut);
    put(5, row.hours);
    put(7, row.detail);
    total = Math.round((total + row.hours) * 100) / 100;
  });

  // ---- Horizontal rules, skipping the inside of merged date/course cells ----
  placed.forEach((cur, i) => {
    const pg = pages[cur.page];
    const yB = cur.yTop - ROW;
    const next = placed[i + 1];
    const samePage = next && next.page === cur.page;
    const mergeDate = samePage && next.row.work_date === cur.row.work_date;
    const mergeCourse = mergeDate && next.row.courseKey === cur.row.courseKey;

    // build the segments of this bottom rule, skipping merged columns
    const skip = new Set();
    if (mergeDate) skip.add(DATE_COL);
    if (mergeCourse) skip.add(COURSE_COL);

    let segStart = null;
    for (let c = 0; c < cols.length; c++) {
      if (skip.has(c)) {
        if (segStart !== null) {
          hLine(pg, segStart, colX(c), yB);
          segStart = null;
        }
      } else if (segStart === null) {
        segStart = colX(c);
      }
    }
    if (segStart !== null) hLine(pg, segStart, MARGIN + CONTENT_W, yB);
  });

  // ---- Merged text: draw once, centred over the run ----
  const drawRuns = (colIdx, keyOf, valueOf) => {
    let i = 0;
    while (i < placed.length) {
      let j = i;
      while (
        j + 1 < placed.length &&
        placed[j + 1].page === placed[i].page &&
        keyOf(placed[j + 1].row) === keyOf(placed[i].row)
      ) j += 1;
      const pg = pages[placed[i].page];
      const yTopRun = placed[i].yTop;
      const yBotRun = placed[j].yTop - ROW;
      const size = 8;
      const cy = (yTopRun + yBotRun) / 2 - size / 2 + 1;
      centered(pg, valueOf(placed[i].row), colX(colIdx) + cols[colIdx].w / 2, cy, size, font);
      i = j + 1;
    }
  };
  drawRuns(DATE_COL, (r) => r.work_date, (r) => r.dateLabel);
  drawRuns(COURSE_COL, (r) => `${r.work_date}|${r.courseKey}`, (r) => r.courseKey);

  // ---- Total row ----
  let lastPage = pages[p];
  let ty = placed.length ? placed[placed.length - 1].yTop - ROW : headerTop[p] - HROW;
  if (ty - ROW < BOTTOM_LIMIT) {
    lastPage = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(lastPage);
    ty = PAGE_H - MARGIN;
  }
  const totLabel = "Total (Hours)";
  text(lastPage, totLabel, colX(5) - 8 - tw(totLabel, bold, 8.5), ty - ROW + (ROW - 8.5) / 2 + 1, 8.5, bold);
  lastPage.drawRectangle({
    x: colX(5), y: ty - ROW, width: cols[5].w, height: ROW,
    borderColor: black, borderWidth: 0.6,
  });
  centered(lastPage, total, colX(5) + cols[5].w / 2, ty - ROW + (ROW - 8.5) / 2 + 1, 8.5, bold);
  let fy = ty - ROW - 55;

  // ---- Instructor signature block ----
  if (fy < MARGIN + 80) {
    lastPage = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(lastPage);
    fy = PAGE_H - MARGIN - 40;
  }
  centered(lastPage, "For Instructor", colX(1) + cols[1].w / 2, fy, 10.5, bold);
  const sx = MARGIN + CONTENT_W * 0.55;
  centered(lastPage, "Sign ……………………………………………………………….", sx, fy, 10, font);
  centered(lastPage, "(……………………………………………………………………)", sx, fy - 28, 10, font);
  centered(lastPage, "Instructor / Supervisor", sx, fy - 44, 10, font);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
