import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";

// POST /api/timesheet/submit  { month: "YYYY-MM", section_id, term? }
// Confirms (freezes) one section for the given month for the logged-in user.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const month = body.month;
  const sectionId = body.section_id;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "รูปแบบเดือนไม่ถูกต้อง" }, { status: 400 });
  }
  if (!sectionId) {
    return NextResponse.json({ error: "กรุณาระบุรายวิชา/section" }, { status: 400 });
  }

  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const term = body.term || active.code;

  // must have at least one entry in this section+month before confirming
  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const { count } = await supabase
    .from("timesheet_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.uid)
    .eq("section_id", sectionId)
    .eq("semester", term)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd);
  if (!count) {
    return NextResponse.json({ error: "ยังไม่มีข้อมูลการลงเวลาของวิชานี้ในเดือนนี้" }, { status: 400 });
  }

  const { error } = await supabase
    .from("submissions")
    .upsert(
      { user_id: session.uid, section_id: sectionId, term, month, confirmed_at: new Date().toISOString() },
      { onConflict: "user_id,term,month,section_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
