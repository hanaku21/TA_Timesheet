import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const TABLES = [
  "terms", "curricula", "users", "courses", "sections",
  "assignments", "timesheet_entries", "blackout_periods",
  "blackout_curricula", "settings",
];

// GET /api/admin/backup?format=json|xlsx
export async function GET(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "json";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  const dump = {};
  for (const t of TABLES) {
    const { data } = await supabase.from(t).select("*");
    dump[t] = data || [];
  }

  if (format === "json") {
    const body = JSON.stringify({ exported_at: new Date().toISOString(), tables: dump }, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="backup_${stamp}.json"`,
      },
    });
  }

  // xlsx: one sheet per table (password_hash omitted for readability/safety)
  const wb = new ExcelJS.Workbook();
  for (const t of TABLES) {
    const rows = dump[t];
    const ws = wb.addWorksheet(t.slice(0, 31));
    let cols = rows.length ? Object.keys(rows[0]) : [];
    if (t === "users") cols = cols.filter((c) => c !== "password_hash");
    if (cols.length === 0) { ws.addRow(["(ไม่มีข้อมูล)"]); continue; }
    ws.addRow(cols);
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => {
      ws.addRow(cols.map((c) => {
        const v = r[c];
        return v != null && typeof v === "object" ? JSON.stringify(v) : v;
      }));
    });
    ws.columns.forEach((col) => { col.width = 18; });
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="backup_${stamp}.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
