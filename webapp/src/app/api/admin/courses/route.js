import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

// GET — all courses + curricula list
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, name, curriculum_id, curriculum:curricula ( code )")
    .order("code");
  const { data: curricula } = await supabase.from("curricula").select("*").order("id");
  return NextResponse.json({ courses: courses || [], curricula: curricula || [] });
}

// POST { code, name, curriculum_id }
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  const code = (b.code || "").trim();
  const name = (b.name || "").trim();
  if (!code || !name) return NextResponse.json({ error: "กรอกรหัสวิชาและชื่อวิชา" }, { status: 400 });
  const { error } = await supabase
    .from("courses")
    .upsert({ code, name, curriculum_id: b.curriculum_id || null }, { onConflict: "code" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH { id, name?, curriculum_id?, code? }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const upd = {};
  if (b.code) upd.code = String(b.code).trim();
  if (b.name) upd.name = String(b.name).trim();
  if ("curriculum_id" in b) upd.curriculum_id = b.curriculum_id || null;
  const { error } = await supabase.from("courses").update(upd).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=  (cascades sections/assignments/entries of that course)
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
