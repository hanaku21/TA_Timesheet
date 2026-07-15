import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

// GET — list terms with row counts + which is active
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { data: terms } = await supabase.from("terms").select("*").order("code");
  // counts per term
  const out = [];
  for (const t of terms || []) {
    const [{ count: secs }, { count: ents }] = await Promise.all([
      supabase.from("sections").select("id", { count: "exact", head: true }).eq("semester", t.code),
      supabase.from("timesheet_entries").select("id", { count: "exact", head: true }).eq("semester", t.code),
    ]);
    out.push({ ...t, sections: secs || 0, entries: ents || 0 });
  }
  return NextResponse.json({ terms: out });
}

// POST — create a new term { code, name, start_date, end_date, activate }
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  const code = (b.code || "").trim();
  if (!code) return NextResponse.json({ error: "กรุณาระบุรหัสปีการศึกษา เช่น 2569/2" }, { status: 400 });

  const { data: exists } = await supabase.from("terms").select("id").eq("code", code).maybeSingle();
  if (exists) return NextResponse.json({ error: "มีปีการศึกษานี้อยู่แล้ว" }, { status: 409 });

  const row = {
    code,
    name: (b.name || "").trim() || code,
    start_date: b.start_date || null,
    end_date: b.end_date || null,
    is_active: false,
  };
  const { data: created, error } = await supabase.from("terms").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (b.activate) await activate(supabase, created);
  return NextResponse.json({ ok: true, term: created });
}

// PATCH — set active { id } or update fields { id, name, start_date, end_date }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  if (b.action === "activate") {
    const { data: t } = await supabase.from("terms").select("*").eq("id", b.id).maybeSingle();
    if (!t) return NextResponse.json({ error: "ไม่พบปีการศึกษา" }, { status: 404 });
    await activate(supabase, t);
    return NextResponse.json({ ok: true });
  }

  const upd = {};
  ["name", "start_date", "end_date"].forEach((k) => {
    if (k in b) upd[k] = b[k] || null;
  });
  const { error } = await supabase.from("terms").update(upd).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — ?id=  (?force=1 also deletes that term's sections/assignments/entries)
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: t } = await supabase.from("terms").select("*").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "ไม่พบปีการศึกษา" }, { status: 404 });
  if (t.is_active) return NextResponse.json({ error: "ลบปีที่กำลังใช้งานอยู่ไม่ได้ (สลับไปปีอื่นก่อน)" }, { status: 400 });

  const { count } = await supabase
    .from("sections").select("id", { count: "exact", head: true }).eq("semester", t.code);
  if ((count || 0) > 0 && !force) {
    return NextResponse.json({ error: `ปีนี้มีข้อมูล ${count} section — ยืนยันการลบพร้อมข้อมูลทั้งหมด` , needsForce: true }, { status: 409 });
  }
  if (force) {
    await supabase.from("timesheet_entries").delete().eq("semester", t.code);
    await supabase.from("assignments").delete().eq("semester", t.code);
    await supabase.from("sections").delete().eq("semester", t.code);
  }
  const { error } = await supabase.from("terms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function activate(supabase, term) {
  await supabase.from("terms").update({ is_active: false }).neq("id", 0);
  await supabase.from("terms").update({ is_active: true }).eq("id", term.id);
  // mirror into settings for compatibility
  const kv = [
    { key: "active_term", value: term.code },
    { key: "semester", value: term.code },
    { key: "sem_start", value: term.start_date || "" },
    { key: "sem_end", value: term.end_date || "" },
  ];
  await supabase.from("settings").upsert(kv, { onConflict: "key" });
}
