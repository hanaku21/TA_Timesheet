import ExcelJS from "exceljs";
import { TH_MONTHS } from "@/lib/constants";
import { computeWorkTimeRows } from "@/lib/workTimeSheet";

// "Work time sheet TA Student (CMU Rate)" — the ทุน ป.ตรี (SCHOLARSHIP) form.
// Pass `wb` + `sheetName` to add a worksheet to an existing workbook (one sheet
// per section for the combined download); otherwise a single-sheet .xlsx buffer.
export async function buildWorkTimeSheetWorkbook({ user, month, displayRows, wb: extWb, sheetName }) {
  const wb = extWb || new ExcelJS.Workbook();
  if (!extWb) wb.creator = "CAMT TA Timesheet";
  const ws = wb.addWorksheet(sheetName || "Work time sheet", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });

  const [yy, mm] = month.split("-").map(Number);
  const monthLabel = `${TH_MONTHS[mm - 1]} ${yy + 543}`;

  //  A: MM/DD/YY | B: Time In | C: sign | D: Time Out | E: sign
  //  F: Hours/Record | G: Course (Key) | H: Work Detail
  ws.columns = [
    { width: 12 }, { width: 10 }, { width: 20 }, { width: 10 },
    { width: 20 }, { width: 14 }, { width: 16 }, { width: 18 },
  ];
  const LAST = "H";

  const thin = { style: "thin", color: { argb: "FF000000" } };
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin };

  // ---- Title ----
  ws.mergeCells(`A1:${LAST}1`);
  const t = ws.getCell("A1");
  t.value = "Work time sheet TA Student (CMU Rate)";
  t.font = { bold: true, size: 14 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(`A3:${LAST}3`);
  const s3 = ws.getCell("A3");
  s3.value = monthLabel;
  s3.font = { bold: true, size: 12 };
  s3.alignment = { horizontal: "center" };

  // ---- Fullname / Student ID ----
  ws.getCell("A5").value = "Fullname";
  ws.getCell("A5").font = { bold: true, size: 11 };
  ws.getCell("A5").alignment = { horizontal: "center" };
  ws.mergeCells("B5:D5");
  ws.getCell("B5").value = `${user.title || ""} ${user.full_name}`.trim();
  ws.getCell("B5").font = { size: 11 };

  ws.getCell("E5").value = "Student ID";
  ws.getCell("E5").font = { bold: true, size: 11 };
  ws.getCell("E5").alignment = { horizontal: "center" };
  ws.mergeCells("F5:H5");
  ws.getCell("F5").value = user.student_id || "";
  ws.getCell("F5").font = { size: 11 };
  ws.getCell("F5").alignment = { horizontal: "center" };

  // ---- Table header ----
  const HEADER_ROW = 7;
  const headers = [
    "DD/MM/YYYY", "Time In", "Worker's signature", "Time Out",
    "Worker's signature", "Hours/Record", "Course (Key)", "Work Detail",
  ];
  const hr = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    c.border = allBorder;
  });
  hr.height = 20;

  // ---- Data rows ----
  const rows = computeWorkTimeRows(displayRows);
  let r = HEADER_ROW + 1;
  const firstDataRow = r;
  let totalHours = 0;

  rows.forEach((row) => {
    const xr = ws.getRow(r);
    const vals = [
      row.dateLabel, row.timeIn, "", row.timeOut, "",
      row.hours, row.courseKey, row.detail,
    ];
    vals.forEach((v, i) => {
      const c = xr.getCell(i + 1);
      c.value = v;
      c.border = allBorder;
      c.font = { size: 10 };
      c.alignment = { horizontal: i === 2 || i === 4 ? "left" : "center", vertical: "middle" };
    });
    xr.height = 18;
    totalHours = Math.round((totalHours + row.hours) * 100) / 100;
    r += 1;
  });

  // ---- Merge the date + course cells for each day-group ----
  const mergeRuns = (colLetter, keyOf) => {
    let start = firstDataRow;
    for (let i = 1; i <= rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const sameGroup = cur && keyOf(cur) === keyOf(prev);
      if (!sameGroup) {
        const end = firstDataRow + i - 1;
        if (end > start) {
          ws.mergeCells(`${colLetter}${start}:${colLetter}${end}`);
          ws.getCell(`${colLetter}${start}`).alignment = {
            horizontal: "center", vertical: "middle",
          };
        }
        start = firstDataRow + i;
      }
    }
  };
  mergeRuns("A", (x) => x.work_date);
  mergeRuns("G", (x) => `${x.work_date}|${x.courseKey}`);

  // ---- Total row: "Total (Hours)" label, boxed value in the Hours/Record column ----
  const totRow = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  const tl = totRow.getCell(1);
  tl.value = "Total (Hours)";
  tl.font = { bold: true, size: 10 };
  tl.alignment = { horizontal: "right", vertical: "middle" };
  const totCell = totRow.getCell(6);
  totCell.value = totalHours;
  totCell.font = { bold: true, size: 10 };
  totCell.alignment = { horizontal: "center", vertical: "middle" };
  totCell.border = allBorder; // only the value is boxed
  totRow.height = 18;
  r += 4;

  // ---- Instructor signature block ----
  // "For Instructor" sits in the Time In column (B)
  ws.getCell(`B${r}`).value = "For Instructor";
  ws.getCell(`B${r}`).font = { bold: true, size: 11 };
  ws.getCell(`B${r}`).alignment = { horizontal: "center" };
  ws.mergeCells(`D${r}:H${r}`);
  const sign = ws.getCell(`D${r}`);
  sign.value = "Sign ……………………………………………………………….";
  sign.font = { size: 11 };
  sign.alignment = { horizontal: "center" };

  ws.mergeCells(`D${r + 2}:H${r + 2}`);
  const paren = ws.getCell(`D${r + 2}`);
  paren.value = "(……………………………………………………………………)";
  paren.font = { size: 11 };
  paren.alignment = { horizontal: "center" };

  ws.mergeCells(`D${r + 3}:H${r + 3}`);
  const role = ws.getCell(`D${r + 3}`);
  role.value = "Instructor / Supervisor";
  role.font = { size: 11 };
  role.alignment = { horizontal: "center" };

  if (extWb) return wb; // caller adds more sheets + serializes
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
