import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { computeDisplayRows } from "@/lib/buildTimesheetXlsx";
import { formWorkbook, combinedWorkbook } from "@/lib/exportForms";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";

// GET /api/timesheet/export?month=YYYY-MM&user_id=<optional>
// Exports one user's monthly timesheet as a reimbursement-form .xlsx.
// Admins may export any user; a normal user may export only themselves.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const reqUserId = sp.get("user_id");

  let targetUid = session.uid;
  if (reqUserId && String(reqUserId) !== String(session.uid)) {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
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

  const sectionId = sp.get("section_id"); // optional: export only this section

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

  // blackout (holiday) periods so scholarship carry-over skips them
  const { data: blackouts } = await supabase
    .from("blackout_periods")
    .select("start_date, end_date, blackout_curricula ( curriculum_id )");
  const blk = (blackouts || []).map((b) => ({
    start_date: b.start_date,
    end_date: b.end_date,
    curriculum_ids: (b.blackout_curricula || []).map((c) => c.curriculum_id),
  }));

  // configurable scholarship pay rate / daily cap
  const { data: cfg } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["scholarship_rate", "scholarship_max_hours"]);
  const kv = Object.fromEntries((cfg || []).map((s) => [s.key, s.value]));
  const payConfig = {
    rate: Number(kv.scholarship_rate) || 50,
    maxHours: Number(kv.scholarship_max_hours) || 8,
  };

  // Compute redistributed rows GLOBALLY across all sections (shared day-cap),
  // then optionally keep only the requested section.
  let displayRows = computeDisplayRows({ user, rows: rows || [], month, blackouts: blk, payConfig });
  let chosenSec = null;
  if (sectionId) {
    displayRows = displayRows.filter((r) => String(r.section?.id) === String(sectionId));
    chosenSec = displayRows[0]?.section || null;
    if (displayRows.length === 0) {
      return NextResponse.json({ error: "ไม่มีข้อมูลของ section นี้ในเดือนที่เลือก" }, { status: 404 });
    }
  }

  // One section -> single form. All sections -> one worksheet per section.
  const buffer = chosenSec
    ? await formWorkbook({ user, month, displayRows, payConfig })
    : await combinedWorkbook({ user, month, displayRows, payConfig });

  // filename: "ชื่อ-นามสกุล TA_รหัสวิชา_section_เดือน_ปี.xlsx"
  const [ynum, mnum] = month.split("-");
  let fnameRaw;
  if (chosenSec) {
    fnameRaw = `${user.full_name} TA_${chosenSec.course?.code || ""}_${chosenSec.section || ""}_${mnum}_${ynum}`;
  } else {
    fnameRaw = `${user.full_name} TA_ทุก section_${mnum}_${ynum}`;
  }
  const filename = fnameRaw.replace(/[\\/:*?"<>|]+/g, "_").trim() + ".xlsx";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
    },
  });
}
