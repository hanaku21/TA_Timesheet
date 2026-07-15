import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { buildTimesheetWorkbook, computeDisplayRows } from "@/lib/buildTimesheetXlsx";
import { buildWorkTimeSheetWorkbook } from "@/lib/buildWorkTimeSheetXlsx";
import { buildTaRaWorkbook } from "@/lib/buildTaRaXlsx";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";

// GET /api/timesheet/export-split?month=YYYY-MM&user_id=<optional>&term=<optional>
// One .xlsx per section, zipped. Scholarship hours are redistributed GLOBALLY
// across all the user's sections first (shared 8hr/day cap so days don't collide),
// then split per section into separate files.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const reqUserId = sp.get("user_id");

  let targetUid = session.uid;
  if (reqUserId && String(reqUserId) !== String(session.uid)) {
    if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    targetUid = Number(reqUserId);
  }

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from("users")
    .select("id, title, full_name, employment_type, tor_number, student_id")
    .eq("id", targetUid)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });

  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;
  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("timesheet_entries")
    .select(
      `id, work_date, remark, hours,
       section:sections (
         id, section, teaching_type, start_time, end_time, rate, curriculum_id,
         course:courses ( code, name ),
         curriculum:curricula ( code, name )
       )`
    )
    .eq("user_id", targetUid)
    .eq("semester", term)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date");

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "ไม่มีข้อมูลการลงเวลาในเดือนนี้" }, { status: 404 });
  }

  const { data: bo } = await supabase
    .from("blackout_periods")
    .select("start_date, end_date, blackout_curricula ( curriculum_id )");
  const blackouts = (bo || []).map((b) => ({
    start_date: b.start_date, end_date: b.end_date,
    curriculum_ids: (b.blackout_curricula || []).map((c) => c.curriculum_id),
  }));

  const { data: cfg } = await supabase
    .from("settings").select("key, value").in("key", ["scholarship_rate", "scholarship_max_hours"]);
  const kv = Object.fromEntries((cfg || []).map((s) => [s.key, s.value]));
  const payConfig = { rate: Number(kv.scholarship_rate) || 50, maxHours: Number(kv.scholarship_max_hours) || 8 };

  // 1) compute redistributed rows GLOBALLY (shared day-cap across all sections)
  const allRows = computeDisplayRows({ user, rows, month, blackouts, payConfig });

  // 2) group by section
  const groups = new Map();
  for (const r of allRows) {
    const sid = r.section?.id ?? "unknown";
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(r);
  }

  // 3) one workbook per section, zipped
  const zip = new JSZip();
  const used = new Set();
  for (const [, groupRows] of groups) {
    const sec = groupRows[0].section || {};
    const buf =
      user.employment_type === "SCHOLARSHIP"
        ? await buildWorkTimeSheetWorkbook({ user, month, displayRows: groupRows })
        : user.employment_type === "TA_RA"
        ? await buildTaRaWorkbook({ user, month, displayRows: groupRows })
        : user.employment_type === "TOR"
        ? await buildTaRaWorkbook({ user, month, displayRows: groupRows, title: "แบบใบเบิกค่าตอบแทนงานจ้างเหมาผู้ช่วยสอน" })
        : await buildTimesheetWorkbook({ user, month, payConfig, displayRows: groupRows });
    let base = `${sec.course?.code || "course"}_ตอน${sec.section || "-"}` +
      (sec.teaching_type ? `_${sec.teaching_type}` : "");
    base = base.replace(/[^\p{L}\p{N}_ก-๙-]+/gu, "_");
    let name = `${base}.xlsx`;
    let n = 2;
    while (used.has(name)) name = `${base}_${n++}.xlsx`;
    used.add(name);
    zip.file(name, buf);
  }

  const content = await zip.generateAsync({ type: "nodebuffer" });
  const safeName = (user.full_name || "user").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const filename = `ใบเบิก_${safeName}_${month}.zip`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(content.length),
    },
  });
}
