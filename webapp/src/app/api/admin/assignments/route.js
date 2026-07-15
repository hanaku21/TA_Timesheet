import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

// POST { user_id, section_id } — assign a TA to a section.
// One TA per section: this replaces any existing TA for the section (upsert).
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.user_id || !b.section_id) {
    return NextResponse.json({ error: "เลือกผู้ช่วยสอนและ section" }, { status: 400 });
  }
  const active = await getActiveTerm(supabase);
  const { data: sec } = await supabase
    .from("sections").select("id, semester").eq("id", b.section_id).maybeSingle();
  if (!sec) return NextResponse.json({ error: "ไม่พบ section" }, { status: 404 });

  const semester = sec.semester || active.code;
  const row = {
    user_id: b.user_id,
    section_id: b.section_id,
    semester,
    start_date: active.start_date || null,
    end_date: active.end_date || null,
  };
  // One TA per section per semester. Replace any existing TA explicitly
  // (avoids depending on a DB ON CONFLICT unique constraint, which may be
  // missing on databases created from an older schema).
  const { error: delErr } = await supabase
    .from("assignments")
    .delete()
    .eq("section_id", b.section_id)
    .eq("semester", semester);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  const { error } = await supabase.from("assignments").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=  (assignment id)
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
