import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

// GET /api/admin/timesheets?month=YYYY-MM&curriculum=<id>&type=<emp>&term=<code>
// Returns all timesheet entries for the month + term with user + section context.
export async function GET(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const curriculum = sp.get("curriculum");
  const type = sp.get("type");

  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;

  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

  // Run the reads in parallel instead of sequentially.
  const [entriesRes, curriculaRes, termsRes, subsRes, assignsRes] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select(
        `id, work_date, remark, hours,
         user:users ( id, title, full_name, employment_type, email, student_id, tor_number ),
         section:sections (
           id, section, teaching_type, teaching_days, curriculum_id, start_time, end_time, rate, tor_number,
           course:courses ( code, name ),
           curriculum:curricula ( id, code, name )
         )`
      )
      .eq("semester", term)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd)
      .order("work_date"),
    supabase.from("curricula").select("*").order("id"),
    supabase.from("terms").select("code, name, is_active, start_date, end_date").order("code"),
    supabase.from("submissions").select("user_id, section_id").eq("term", term).eq("month", month),
    // Everyone expected to fill a timesheet this term = active TAs with an
    // assignment (plus the curricula they work in, for filtering the list).
    supabase
      .from("assignments")
      .select(
        `user:users ( id, title, full_name, email, employment_type, student_id, tor_number, active, role ),
         section:sections ( curriculum_id )`
      )
      .eq("semester", term),
  ]);

  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });

  let rows = entriesRes.data || [];
  if (curriculum) rows = rows.filter((r) => String(r.section?.curriculum_id) === String(curriculum));
  if (type) rows = rows.filter((r) => r.user?.employment_type === type);

  // De-duplicate assigned users; collect the curricula each one works in.
  const uMap = new Map();
  (assignsRes.data || []).forEach((a) => {
    const u = a.user;
    if (!u || u.active === false || u.role !== "user") return;
    if (!uMap.has(u.id)) {
      uMap.set(u.id, {
        id: u.id, title: u.title, full_name: u.full_name, email: u.email,
        employment_type: u.employment_type, student_id: u.student_id, tor_number: u.tor_number,
        curriculum_ids: new Set(),
      });
    }
    const cid = a.section?.curriculum_id;
    if (cid != null) uMap.get(u.id).curriculum_ids.add(cid);
  });
  const assignedUsers = [...uMap.values()].map((u) => ({ ...u, curriculum_ids: [...u.curriculum_ids] }));

  return NextResponse.json({
    rows,
    curricula: curriculaRes.data || [],
    terms: termsRes.data || [],
    confirmed: (subsRes.data || []).map((s) => `${s.user_id}|${s.section_id}`), // confirmed (user|section) this month
    assignedUsers, // active TAs expected to fill this term (+ their curricula)
    totalUsers: assignedUsers.length, // # of expected TAs
    activeTerm: active.code,
    term,
  });
}

// DELETE /api/admin/timesheets?user_id=&section_id=&month=YYYY-MM&term=
// Removes all of a user's timesheet entries for one section within a month.
export async function DELETE(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  const sectionId = sp.get("section_id");
  const month = sp.get("month");
  if (!userId || !sectionId || !month) {
    return NextResponse.json({ error: "missing user_id / section_id / month" }, { status: 400 });
  }

  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;
  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

  const { data: deleted, error } = await supabase
    .from("timesheet_entries")
    .delete()
    .eq("user_id", userId)
    .eq("section_id", sectionId)
    .eq("semester", term)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: (deleted || []).length });
}
