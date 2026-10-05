import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { LAKSAMAN_REGULAR_B64, LAKSAMAN_BOLD_B64 } from "@/lib/fontsData";
import { bahtText } from "@/lib/bahtText";
import { wrapTextLines } from "@/lib/textWrap";
import { itemText, docNumber, displayName, COMPANY_INFO } from "@/lib/buildTorBillXlsx";

// PDF version of ใบวางบิล / ใบเสร็จรับเงิน (จ้างเหมา) — same grid as the Excel template:
// A4 portrait, 9 columns (A–I) with the template's relative widths, 36 rows.

const COL_UNITS = [9, 10.1, 11.9, 9, 12.1, 9, 1.1, 10.9, 9]; // Excel widths of A..I
const money = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildTorDocPdf({ kind, user, tor, amount, subjects, termCode }) {
  const isBill = kind === "bill";
  const fullName = displayName(user);
  const docNo = docNumber(kind, termCode, tor);
  const total = Math.round(Number(amount || 0) * 100) / 100;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(LAKSAMAN_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LAKSAMAN_BOLD_B64, "base64"), { subset: true });

  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 46;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const black = rgb(0, 0, 0);
  const fillCol = isBill ? rgb(0.87, 0.918, 0.965) : rgb(0.906, 0.902, 0.902);
  const FS = 11;          // ≈ Sarabun 10 in the template
  const ROW = 19.5;       // row height

  // grid geometry
  const totalUnits = COL_UNITS.reduce((a, b) => a + b, 0);
  const contentW = PAGE_W - MARGIN * 2;
  const colX = [MARGIN];
  COL_UNITS.forEach((u) => colX.push(colX[colX.length - 1] + (u / totalUnits) * contentW));
  const L = (letter) => letter.charCodeAt(0) - 65;              // column index
  const x0 = (c) => colX[L(c)];                                // left edge of column
  const x1 = (c) => colX[L(c) + 1];                            // right edge of column
  const rowH = (r) => (r === 6 ? 8 : r === 12 ? 10 : ROW);
  const yTop = (r) => { let y = PAGE_H - MARGIN; for (let i = 1; i < r; i++) y -= rowH(i); return y; };
  const yBot = (r) => yTop(r) - rowH(r);

  const tw = (s, f, size) => f.widthOfTextAtSize(String(s ?? ""), size);
  const text = (s, x, y, { f = font, size = FS, color = black } = {}) =>
    page.drawText(String(s ?? ""), { x, y, size, font: f, color });
  // text inside the cell range c1..c2 of row r (vertically centred)
  const put = (s, c1, c2, r, { align = "left", f = font, size = FS, pad = 3, dy = 0 } = {}) => {
    const left = x0(c1), right = x1(c2), width = right - left;
    const y = yBot(r) + (rowH(r) - size * 0.72) / 2 + dy;
    const w = tw(s, f, size);
    const x = align === "center" ? left + (width - w) / 2 : align === "right" ? right - pad - w : left + pad;
    text(s, x, y, { f, size });
  };
  const line = (xa, ya, xb, yb) => page.drawLine({ start: { x: xa, y: ya }, end: { x: xb, y: yb }, thickness: 0.6, color: black });
  const fillRect = (c1, c2, r1, r2) =>
    page.drawRectangle({ x: x0(c1), y: yBot(r2), width: x1(c2) - x0(c1), height: yTop(r1) - yBot(r2), color: fillCol });
  const box = (c1, c2, r1, r2) => {
    const l = x0(c1), rr = x1(c2), t = yTop(r1), b = yBot(r2);
    line(l, t, rr, t); line(l, b, rr, b); line(l, t, l, b); line(rr, t, rr, b);
  };
  const hline = (c1, c2, y) => line(x0(c1), y, x1(c2), y);

  // ---- header (seller) ----
  if (isBill) { put("ชื่อ ", "A", "A", 1, { f: bold }); put(fullName, "B", "E", 1); }
  else put(fullName, "A", "E", 1, { f: bold });
  put(isBill ? "ใบวางบิล / ใบแจ้งค่าใช้จ่าย" : "ใบเสร็จรับเงิน", "F", "I", 1, { align: "right", f: bold });
  put("ที่อยู่ ", "A", "A", 2);
  put(user.address || "", "B", "G", 2);
  put("หน้า 1/1", "H", "I", 2, { align: "right" });
  put("โทร. ", "A", "A", 4);
  put(user.phone || "", "B", "E", 4);
  put("เลขประจำตัวผู้เสียภาษี ", "A", "B", 5);
  put(user.id_card || "", "C", "E", 5);

  // ---- customer box rows 7–11 (left) + date / doc no. (right) ----
  box("A", "F", 7, 11);
  put("ชื่อลูกค้า", "A", "A", 8); put(COMPANY_INFO.name, "B", "F", 8);
  put("ที่อยู่", "A", "A", 9); put(COMPANY_INFO.address, "B", "F", 9);
  put("โทรศัพท์", "A", "A", 10); put(COMPANY_INFO.phone, "B", "C", 10);
  put("เลขประจำตัวผู้เสียภาษี", "A", "B", 11); put(COMPANY_INFO.taxId, "C", "D", 11); put(COMPANY_INFO.branch, "E", "F", 11);

  fillRect("H", "I", 7, 7); box("H", "I", 7, 7); put("วันที่", "H", "I", 7, { align: "center" });
  box("H", "I", 8, 8); // date left blank — filled in by hand
  fillRect("H", "I", 10, 10); box("H", "I", 10, 10); put(isBill ? "เลขที่ใบวางบิล" : "เลขที่เอกสาร", "H", "I", 10, { align: "center" });
  box("H", "I", 11, 11); put(docNo, "H", "I", 11, { align: "center" });

  // ---- items table rows 13–21 ----
  box("A", "A", 13, 13); put("ลำดับที่", "A", "A", 13, { align: "center", f: bold });
  box("B", "D", 13, 13); put("รายการ", "B", "D", 13, { align: "center", f: bold });
  box("E", "F", 13, 13); put("ประจำงวด/เดือน", "E", "F", 13, { align: "center", f: bold });
  box("G", "I", 13, 13); put("จำนวนเงิน", "G", "I", 13, { align: "center", f: bold });

  box("A", "A", 14, 21); box("B", "D", 14, 21); box("E", "F", 14, 21); box("G", "I", 14, 21);
  put("1", "A", "A", 14, { align: "center" });
  // wrapped item text, top-aligned in B14:D21
  const itemW = x1("D") - x0("B") - 8;
  // wrap the course part normally; keep "(ชื่อ)" unbroken — append to the last line
  // if it fits, otherwise put the whole parenthesis on its own line
  const full = itemText(subjects, fullName);
  const paren = `(${fullName})`;
  const head = full.endsWith(paren) ? full.slice(0, -paren.length).trimEnd() : full;
  const measure = (t) => tw(t, font, FS);
  const lines = wrapTextLines(head, itemW, measure);
  if (full.endsWith(paren)) {
    const last = lines[lines.length - 1] || "";
    if (measure(`${last} ${paren}`) <= itemW) lines[lines.length - 1] = `${last} ${paren}`.trim();
    else lines.push(paren);
  }
  let ly = yTop(14) - 4 - FS * 0.9;
  for (const ln of lines.slice(0, 7)) { text(ln, x0("B") + 4, ly); ly -= FS * 1.35; }
  put("-", "E", "F", 14, { align: "center" });
  put(money(total), "G", "I", 14, { align: "center" });

  // ---- totals rows 22–24 ----
  fillRect("A", "F", 22, 22); fillRect("G", "I", 22, 22);
  hline("A", "I", yTop(22)); line(x0("A"), yTop(22), x0("A"), yBot(22)); line(x0("G"), yTop(22), x0("G"), yBot(22)); line(x1("I"), yTop(22), x1("I"), yBot(22));
  put("รวมเป็นเงิน", "A", "F", 22, { align: "right" });
  put(money(total), "G", "I", 22, { align: "center" });

  hline("A", "I", yTop(23)); hline("A", "F", yBot(23));
  line(x0("A"), yTop(23), x0("A"), yBot(23)); line(x0("G"), yTop(23), x0("G"), yBot(23)); line(x1("I"), yTop(23), x1("I"), yBot(23));
  put("ส่วนลด", "F", "F", 23, { align: "right" });
  put(money(0), "G", "I", 23, { align: "center" });

  fillRect("A", "I", 24, 24);
  box("A", "I", 24, 24); line(x0("G"), yTop(24), x0("G"), yBot(24));
  put("จำนวนเงิน", "A", "A", 24, { f: bold });
  put(bahtText(total), "B", "E", 24, { align: "center" });
  put("จำนวนรวม", "F", "F", 24, { align: "right", f: bold });
  put(money(total), "G", "I", 24, { align: "center", f: bold });

  // ---- note box rows 25–26 ----
  box("A", "I", 25, 26);
  put("หมายเหตุ : ", "A", "B", 25);

  // ---- paid stamp (receipt) ----
  if (!isBill) put("ได้รับชำระเรียบร้อยแล้ว", "E", "H", 29, { align: "center" });

  // ---- signature rows 32–34 ----
  put("ลงชื่อ .......................................................", "E", "H", 32, { align: "center" });
  put(`(${fullName})`, "E", "H", 33, { align: "center" });
  put("วันที่ .............................................", "E", "H", 34, { align: "center" });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
