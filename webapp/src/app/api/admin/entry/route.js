import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

// POST { user_id, section_id, work_date, remark } — admin adds an entry
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.user_id || !b.section_id || !b.work_date) {
    return NextResponse.json({ error: "ต้องระบุผู้ใช้ section และวันที่" }, { status: 400 });
  }
  const { data: sec } = await supabase.from("sections").select("semester").eq("id", b.section_id).maybeSingle();
  const row = {
    user_id: b.user_id,
    section_id: b.section_id,
    work_date: b.work_date,
    remark: b.remark || null,
    hours: b.hours === "" || b.hours == null ? null : Number(b.hours),
    semester: sec?.semester || "2569/1",
  };
  const { error } = await supabase
    .from("timesheet_entries")
    .upsert(row, { onConflict: "user_id,section_id,work_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH { id, work_date?, remark? }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const upd = {};
  if (b.work_date) upd.work_date = b.work_date;
  if ("remark" in b) upd.remark = b.remark || null;
  if ("hours" in b) upd.hours = b.hours === "" || b.hours == null ? null : Number(b.hours);
  const { error } = await supabase.from("timesheet_entries").update(upd).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("timesheet_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
