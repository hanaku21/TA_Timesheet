import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") return null;
  return s;
}

// GET — list blackout periods (with curricula) + all curricula for the picker
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();

  const { data: periods } = await supabase
    .from("blackout_periods")
    .select("id, start_date, end_date, reason, blackout_curricula ( curriculum_id )")
    .order("start_date");

  const { data: curricula } = await supabase.from("curricula").select("*").order("id");

  const list = (periods || []).map((p) => ({
    id: p.id,
    start_date: p.start_date,
    end_date: p.end_date,
    reason: p.reason,
    curriculum_ids: (p.blackout_curricula || []).map((c) => c.curriculum_id),
  }));

  return NextResponse.json({ periods: list, curricula: curricula || [] });
}

// POST — create a blackout period { start_date, end_date, reason, curriculum_ids:[] }
export async function POST(req) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { start_date, end_date, reason, curriculum_ids } = await req.json();

  if (!start_date || !end_date) {
    return NextResponse.json({ error: "กรุณาเลือกช่วงวันที่" }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" }, { status: 400 });
  }

  const { data: period, error } = await supabase
    .from("blackout_periods")
    .insert({ start_date, end_date, reason: reason || null, created_by: s.uid })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(curriculum_ids) && curriculum_ids.length > 0) {
    const rows = curriculum_ids.map((cid) => ({
      blackout_id: period.id,
      curriculum_id: cid,
    }));
    const { error: e2 } = await supabase.from("blackout_curricula").insert(rows);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: period.id });
}

// PATCH — update a blackout period { id, start_date, end_date, reason, curriculum_ids:[] }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { id, start_date, end_date, reason, curriculum_ids } = await req.json();

  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (!start_date || !end_date) {
    return NextResponse.json({ error: "กรุณาเลือกช่วงวันที่" }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" }, { status: 400 });
  }

  const { error } = await supabase
    .from("blackout_periods")
    .update({ start_date, end_date, reason: reason || null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // replace the curriculum links
  await supabase.from("blackout_curricula").delete().eq("blackout_id", id);
  if (Array.isArray(curriculum_ids) && curriculum_ids.length > 0) {
    const rows = curriculum_ids.map((cid) => ({ blackout_id: id, curriculum_id: cid }));
    const { error: e2 } = await supabase.from("blackout_curricula").insert(rows);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — ?id=
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("blackout_periods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
