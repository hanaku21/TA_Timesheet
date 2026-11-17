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
    // people assigned in this term, and how many of them can log in right now
    const { data: assigns } = await supabase.from("assignments").select("user_id, user:users ( active, role )").eq("semester", t.code);
    const seen = new Set(); let people = 0, activePeople = 0;
    (assigns || []).forEach((a) => {
      if (!a.user || a.user.role !== "user" || seen.has(a.user_id)) return;
      seen.add(a.user_id); people += 1; if (a.user.active !== false) activePeople += 1;
    });
    out.push({ ...t, sections: secs || 0, entries: ents || 0, people, active_people: activePeople });
  }
  const { count: activeUsers } = await supabase
    .from("users").select("id", { count: "exact", head: true }).eq("role", "user").neq("active", false);
  return NextResponse.json({ terms: out, active_users: activeUsers || 0 });
}

// POST — create a new term { code, name, start_date, end_date, activate }
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  const code = (b.code || "").trim();
  if (!code) return NextResponse.json({ error: "กรุณาระบุรหัสภาคการศึกษา เช่น 2569/2" }, { status: 400 });

  const { data: exists } = await supabase.from("terms").select("id").eq("code", code).maybeSingle();
  if (exists) return NextResponse.json({ error: "มีภาคการศึกษานี้อยู่แล้ว" }, { status: 409 });

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

  // Every TA account (role user) -> inactive, regardless of term. Admins untouched.
  if (b.action === "deactivate_all") {
    const { data, error } = await supabase.from("users").update({ active: false }).eq("role", "user").neq("active", false).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: (data || []).length });
  }
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Re-enable the TA accounts of a term: everyone who has an assignment in that term
  // becomes active (others untouched). Use it to "go back" to a term's people.
  if (b.action === "activate_users" || b.action === "deactivate_users") {
    const { data: t } = await supabase.from("terms").select("*").eq("id", b.id).maybeSingle();
    if (!t) return NextResponse.json({ error: "ไม่พบภาคการศึกษา" }, { status: 404 });
    const { data: assigns } = await supabase.from("assignments").select("user_id").eq("semester", t.code);
    const ids = [...new Set((assigns || []).map((a) => a.user_id).filter((x) => x != null))];
    if (b.action === "activate_users") {
      if (b.only) await supabase.from("users").update({ active: false }).eq("role", "user");
      if (ids.length) await supabase.from("users").update({ active: true }).in("id", ids).eq("role", "user");
    } else if (ids.length) {
      await supabase.from("users").update({ active: false }).in("id", ids).eq("role", "user");
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (b.action === "activate") {
    const { data: t } = await supabase.from("terms").select("*").eq("id", b.id).maybeSingle();
    if (!t) return NextResponse.json({ error: "ไม่พบภาคการศึกษา" }, { status: 404 });
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
  if (!t) return NextResponse.json({ error: "ไม่พบภาคการศึกษา" }, { status: 404 });
  if (t.is_active) return NextResponse.json({ error: "ลบภาคที่กำลังใช้งานอยู่ไม่ได้ (สลับไปภาคอื่นก่อน)" }, { status: 400 });

  const { count } = await supabase
    .from("sections").select("id", { count: "exact", head: true }).eq("semester", t.code);
  if ((count || 0) > 0 && !force) {
    return NextResponse.json({ error: `ภาคนี้มีข้อมูล ${count} section — ยืนยันการลบพร้อมข้อมูลทั้งหมด` , needsForce: true }, { status: 409 });
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
  const { data: prev } = await supabase.from("terms").select("id, code").eq("is_active", true).maybeSingle();
  await supabase.from("terms").update({ is_active: false }).neq("id", 0);
  await supabase.from("terms").update({ is_active: true }).eq("id", term.id);
  // Switching to a DIFFERENT term: every TA account goes inactive (they cannot log in)
  // until the new term's ผู้ช่วยสอน file is imported, which re-activates exactly the people in it.
  // Sections/assignments are already per term, and holidays are per term (migration 010),
  // so the new term starts empty until its own import / holiday entries.
  if (!prev || prev.id !== term.id) {
    await supabase.from("users").update({ active: false }).eq("role", "user");
  }
  // mirror into settings for compatibility
  const kv = [
    { key: "active_term", value: term.code },
    { key: "semester", value: term.code },
    { key: "sem_start", value: term.start_date || "" },
    { key: "sem_end", value: term.end_date || "" },
  ];
  await supabase.from("settings").upsert(kv, { onConflict: "key" });
}
