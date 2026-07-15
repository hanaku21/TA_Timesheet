import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

const DEFAULTS = { scholarship_rate: "50", scholarship_max_hours: "8" };

// GET — current pay config
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["scholarship_rate", "scholarship_max_hours"]);
  const kv = Object.fromEntries((data || []).map((s) => [s.key, s.value]));
  return NextResponse.json({
    scholarship_rate: Number(kv.scholarship_rate ?? DEFAULTS.scholarship_rate),
    scholarship_max_hours: Number(kv.scholarship_max_hours ?? DEFAULTS.scholarship_max_hours),
  });
}

// POST — save { scholarship_rate, scholarship_max_hours }
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  const rate = Number(b.scholarship_rate);
  const maxH = Number(b.scholarship_max_hours);
  if (!(rate > 0) || !(maxH > 0)) {
    return NextResponse.json({ error: "อัตราและเพดานชั่วโมงต้องมากกว่า 0" }, { status: 400 });
  }
  const rows = [
    { key: "scholarship_rate", value: String(rate) },
    { key: "scholarship_max_hours", value: String(maxH) },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
