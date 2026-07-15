import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/admin/reset  { confirm: "RESET" }
// Full system reset: deletes all timesheet entries, assignments, sections,
// courses, and non-admin users. Keeps admin accounts, curricula, blackout
// periods, and settings.
export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch {}
  if (body.confirm !== "RESET") {
    return NextResponse.json(
      { error: 'กรุณาพิมพ์คำว่า RESET เพื่อยืนยันการลบข้อมูล' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const report = {};

  // child -> parent order (explicit, so we can report counts)
  const steps = [
    ["timesheet", () => supabase.from("timesheet_entries").delete().gt("id", 0).select("id")],
    ["assignments", () => supabase.from("assignments").delete().gt("id", 0).select("id")],
    ["sections", () => supabase.from("sections").delete().gt("id", 0).select("id")],
    ["courses", () => supabase.from("courses").delete().gt("id", 0).select("id")],
    ["users", () => supabase.from("users").delete().neq("role", "admin").select("id")],
  ];

  for (const [key, fn] of steps) {
    const { data, error } = await fn();
    if (error) {
      return NextResponse.json(
        { error: `ลบ ${key} ไม่สำเร็จ: ${error.message}`, report },
        { status: 500 }
      );
    }
    report[key] = (data || []).length;
  }

  return NextResponse.json({ ok: true, report });
}
