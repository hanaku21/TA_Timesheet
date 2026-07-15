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
  return NextResponse.json({ sections: out, courses: courses || [], curricula: curricula || [], term });
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
  f.semester = active.code;
  const { error } = await supabase.from("sections").upsert(f, { onConflict: "course_id,section,semester,teaching_type" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
