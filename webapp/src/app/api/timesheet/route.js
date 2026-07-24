import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { costPerDay, isModule, entryCost, entryHours, toRate } from "@/lib/calc";
import { getActiveTerm } from "@/lib/term";

// GET /api/timesheet  (returns ALL of the user's entries; client filters by month)
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const uid = session.uid;
  const term = await getActiveTerm(supabase);

  // Run the three independent reads in parallel instead of sequentially.
  const [assignsRes, entriesRes, blackoutsRes] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        `id, start_date, end_date,
         section:sections (
           id, section, teaching_type, teaching_days, start_time, end_time, instructor,
           curriculum_id, rate, expected_cost, tor_number,
           course:courses ( id, code, name ),
           curriculum:curricula ( id, code, name )
         )`
      )
      .eq("user_id", uid)
      .eq("semester", term.code),
    supabase
      .from("timesheet_entries")
      .select("id, section_id, work_date, remark, hours")
      .eq("user_id", uid)
      .eq("semester", term.code)
      .order("work_date"),
    supabase
      .from("blackout_periods")
      .select("id, start_date, end_date, reason, blackout_curricula ( curriculum_id )"),
  ]);

  const sections = (assignsRes.data || [])
    .filter((a) => a.section)
    .map((a) => ({
      assignment_id: a.id,
      start_date: a.start_date,
      end_date: a.end_date,
      ...a.section,
    }));

  const entries = entriesRes.data;
  const blackouts = blackoutsRes.data;

  const blk = (blackouts || []).map((b) => ({
    id: b.id,
    start_date: b.start_date,
    end_date: b.end_date,
    reason: b.reason,
    curriculum_ids: (b.blackout_curricula || []).map((c) => c.curriculum_id),
  }));

  return NextResponse.json({
    sections,
    entries: entries || [],
    blackouts: blk,
    semester: { start: term.start_date, end: term.end_date, label: term.code },
  });
}

// POST /api/timesheet  { section_id, dates: ["YYYY-MM-DD"], remark }
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const uid = session.uid;
  const term = await getActiveTerm(supabase);
  const body = await req.json();
  const section_id = body.section_id;

  // Accept per-date items [{date, remark, hours}] or legacy {dates, remark}
  let items = [];
  if (Array.isArray(body.items)) {
    items = body.items.filter((i) => i && i.date).map((i) => ({ date: i.date, remark: i.remark || null, hours: i.hours }));
  } else if (Array.isArray(body.dates)) {
    items = body.dates.map((d) => ({ date: d, remark: body.remark || null }));
  }
  // de-duplicate by date (last one wins)
  const byDate = {};
  items.forEach((i) => (byDate[i.date] = i));
  items = Object.values(byDate);
  const dates = items.map((i) => i.date);

  if (!section_id || dates.length === 0) {
    return NextResponse.json({ error: "กรุณาเลือก section และวันที่อย่างน้อย 1 วัน" }, { status: 400 });
  }

  // verify the section belongs to this user (active term) + load budget fields
  const { data: assign } = await supabase
    .from("assignments")
    .select(
      "id, section:sections ( id, curriculum_id, teaching_type, teaching_days, start_time, end_time, rate, expected_cost )"
    )
    .eq("user_id", uid)
    .eq("section_id", section_id)
    .eq("semester", term.code)
    .maybeSingle();
  if (!assign || !assign.section) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์ในรายวิชา/section นี้" }, { status: 403 });
  }
  const section = assign.section;
  const curriculumId = section.curriculum_id;
  const moduleSection = isModule(section);

  // MODULE sections require a positive hours value per day
  if (moduleSection) {
    const bad = items.find((i) => !(Number(i.hours) > 0));
    if (bad) {
      return NextResponse.json({ error: "วิชาแบบ Module ต้องกรอกจำนวนชั่วโมง (มากกว่า 0) ทุกวัน" }, { status: 400 });
    }
  } else {
    // for LEC/LAB the hours field is optional, but if given it must be positive
    const bad = items.find((i) => i.hours != null && i.hours !== "" && !(Number(i.hours) > 0));
    if (bad) {
      return NextResponse.json({ error: "จำนวนชั่วโมงต้องมากกว่า 0" }, { status: 400 });
    }
  }
  const hasHours = (i) => i.hours != null && i.hours !== "" && Number(i.hours) > 0;

  // blackout periods + existing entries for this section — fetched in parallel
  const [blackoutsRes, existingRes] = await Promise.all([
    supabase
      .from("blackout_periods")
      .select("start_date, end_date, blackout_curricula ( curriculum_id )"),
    supabase
      .from("timesheet_entries")
      .select("work_date, hours")
      .eq("user_id", uid)
      .eq("section_id", section_id),
  ]);
  const blackouts = blackoutsRes.data;

  const isBlocked = (d) =>
    (blackouts || []).some((b) => {
      if (d < b.start_date || d > b.end_date) return false;
      const curs = (b.blackout_curricula || []).map((c) => c.curriculum_id);
      return curs.length === 0 || curs.includes(curriculumId);
    });

  const blockedDates = dates.filter(isBlocked);
  if (blockedDates.length > 0) {
    return NextResponse.json(
      { error: "มีวันที่อยู่ในช่วงห้ามลงเวลา: " + blockedDates.join(", ") },
      { status: 400 }
    );
  }

  // --- budget check (expected_cost cap), entry-aware for module + normal ---
  const budget = section.expected_cost == null ? null : Number(section.expected_cost);

  // existing entries for this section (fetched above) -> used cost,
  // excluding dates being re-submitted (they'll be overwritten).
  const existing = existingRes.data;
  const submitDates = new Set(items.map((i) => i.date));
  const usedCost = (existing || [])
    .filter((e) => !submitDates.has(e.work_date))
    .reduce((a, e) => a + entryCost(section, e), 0);

  const newCost = items.reduce(
    (a, i) => a + entryCost(section, { hours: hasHours(i) ? i.hours : null }),
    0
  );

  if (budget != null) {
    const projected = Math.round((usedCost + newCost) * 100) / 100;
    if (projected > budget + 1e-6) {
      return NextResponse.json(
        {
          error:
            `เกินงบประมาณที่กำหนด (ค่าใช้จ่ายคาดการณ์ ${budget.toLocaleString("th-TH")} บาท). ` +
            `ใช้ไปแล้ว ${usedCost.toLocaleString("th-TH")} + รายการนี้ ${newCost.toLocaleString("th-TH")} บาท`,
        },
        { status: 400 }
      );
    }
  }

  const rows = items.map((i) => ({
    user_id: uid,
    section_id,
    work_date: i.date,
    remark: i.remark || null,
    hours: hasHours(i) ? Math.round(Number(i.hours) * 100) / 100 : null,
    semester: term.code,
  }));

  const { error } = await supabase
    .from("timesheet_entries")
    .upsert(rows, { onConflict: "user_id,section_id,work_date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: rows.length });
}

// DELETE /api/timesheet?id=123
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { error } = await supabase
    .from("timesheet_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", session.uid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
