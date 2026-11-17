import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

const EMP = ["TOR", "SCHOLARSHIP", "TA_RA"];

function sectionFields(b) {
  const f = {};
  if ("section" in b) f.section = String(b.section || "").trim();
  if ("course_id" in b) f.course_id = b.course_id || null;
  if ("curriculum_id" in b) f.curriculum_id = b.curriculum_id || null;
  if ("teaching_type" in b) f.teaching_type = (b.teaching_type || "").trim() || null;
  if ("teaching_days" in b) f.teaching_days = Array.isArray(b.teaching_days) ? b.teaching_days : [];
  if ("start_time" in b) f.start_time = (b.start_time || "").trim() || null;
  if ("end_time" in b) f.end_time = (b.end_time || "").trim() || null;
  if ("instructor" in b) f.instructor = (b.instructor || "").trim() || null;
  if ("rate" in b) f.rate = (String(b.rate ?? "").trim()) || null;
  if ("expected_cost" in b) f.expected_cost = b.expected_cost === "" || b.expected_cost == null ? null : Number(b.expected_cost);
  if ("employment_type" in b && EMP.includes(b.employment_type)) f.employment_type = b.employment_type;
  if ("tor_number" in b) f.tor_number = (b.tor_number || "").trim() || null;
  return f;
}

// GET ?term=  — sections of the term with course/curriculum + assigned users
export async function GET(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const term = req.nextUrl.searchParams.get("term") || active.code;

  const { data: sections } = await supabase
    .from("sections")
    .select(
      `id, section, teaching_type, teaching_days, start_time, end_time, instructor,
       rate, expected_cost, employment_type, tor_number, curriculum_id, course_id, semester,
       course:courses ( id, code, name ),
       curriculum:curricula ( id, code )`
    )
    .eq("semester", term)
    .order("course_id");

  const ids = (sections || []).map((s) => s.id);
  let assignsBySection = {};
  if (ids.length) {
    const { data: assigns } = await supabase
      .from("assignments")
      .select("id, section_id, user:users ( id, full_name, employment_type )")
      .in("section_id", ids);
    (assigns || []).forEach((a) => {
      (assignsBySection[a.section_id] ||= []).push(a);
    });
  }
  const out = (sections || []).map((s) => ({ ...s, assignments: assignsBySection[s.id] || [] }));

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, name, curriculum_id, curriculum:curricula ( code )")
    .order("code");
  const { data: curricula } = await supabase.from("curricula").select("*").order("id");
  const { data: terms } = await supabase.from("terms").select("code, is_active").order("code");
  return NextResponse.json({ sections: out, courses: courses || [], curricula: curricula || [], term, active_term: active.code, terms: terms || [] });
}

// POST — create section in active term
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const b = await req.json();
  const f = sectionFields(b);
  if (!f.course_id || !f.section) {
    return NextResponse.json({ error: "เลือกวิชาและระบุตอน (section)" }, { status: 400 });
  }
  f.semester = (b.term || "").trim() || active.code; // the term the admin is viewing
  const { error } = await supabase.from("sections").upsert(f, { onConflict: "course_id,section,semester,teaching_type" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT — move ALL sections of one term to another { from_term, to_term }
//   Moves the sections together with their assignments, timesheet entries, confirmations
//   and TOR periods, so nothing is orphaned. Refuses if the destination already has the
//   same course/section/type (unique key) — nothing is changed in that case.
export async function PUT(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { from_term, to_term } = await req.json();
  if (!from_term || !to_term) return NextResponse.json({ error: "ต้องระบุภาคการศึกษาต้นทางและปลายทาง" }, { status: 400 });
  if (from_term === to_term) return NextResponse.json({ error: "ภาคต้นทางและปลายทางเป็นภาคเดียวกัน" }, { status: 400 });
  const { data: dest } = await supabase.from("terms").select("code").eq("code", to_term).maybeSingle();
  if (!dest) return NextResponse.json({ error: `ไม่พบภาคการศึกษา ${to_term}` }, { status: 404 });

  const sel = "id, course_id, section, teaching_type, course:courses ( code )";
  const [{ data: src }, { data: dst }] = await Promise.all([
    supabase.from("sections").select(sel).eq("semester", from_term),
    supabase.from("sections").select(sel).eq("semester", to_term),
  ]);
  if (!src || src.length === 0) return NextResponse.json({ error: `ภาค ${from_term} ไม่มี section ให้ย้าย` }, { status: 400 });
  const keyOf = (s) => `${s.course_id}|${s.section}|${s.teaching_type}`;
  const taken = new Set((dst || []).map(keyOf));
  const clash = src.filter((s) => taken.has(keyOf(s)));
  if (clash.length) {
    const list = clash.slice(0, 8).map((s) => `${s.course?.code || s.course_id} ตอน ${s.section} ${s.teaching_type || ""}`.trim()).join(", ");
    return NextResponse.json(
      { error: `ภาค ${to_term} มี section ซ้ำกันอยู่แล้ว ${clash.length} รายการ (${list}${clash.length > 8 ? ", …" : ""}) — ลบ/แก้ของภาคปลายทางก่อนแล้วลองใหม่` },
      { status: 409 }
    );
  }

  const ids = src.map((s) => s.id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const steps = [
    ["sections", "semester", "id"],
    ["assignments", "semester", "section_id"],
    ["timesheet_entries", "semester", "section_id"],
    ["submissions", "term", "section_id"],
  ];
  const moved = {};
  for (const [table, col, idCol] of steps) {
    moved[table] = 0;
    for (const part of chunks) {
      const { data, error } = await supabase.from(table).update({ [col]: to_term }).in(idCol, part).select("id");
      if (error) return NextResponse.json({ error: `${table}: ${error.message}`, moved }, { status: 500 });
      moved[table] += (data || []).length;
    }
  }
  // TOR contract windows of that term follow along (skipped quietly if the destination already has them)
  const { data: tp } = await supabase.from("tor_periods").update({ term: to_term }).eq("term", from_term).select("id");
  moved.tor_periods = (tp || []).length;

  return NextResponse.json({ ok: true, moved });
}

// PATCH — update section { id, ...fields }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const f = sectionFields(b);
  const { error } = await supabase.from("sections").update(f).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
