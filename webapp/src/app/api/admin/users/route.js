import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const TYPES = ["TOR", "SCHOLARSHIP", "TA_RA"];
async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

// GET ?q=search
export async function GET(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  let query = supabase
    .from("users")
    .select("id, title, full_name, email, employment_type, student_id, tor_number, phone, role, report_status, active")
    .order("full_name");
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,student_id.ilike.%${q}%,tor_number.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

// POST create { full_name, email, employment_type, password, student_id, tor_number, title, phone }
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  const full_name = (b.full_name || "").trim();
  const email = (b.email || "").trim().toLowerCase();
  if (!full_name || !email || !TYPES.includes(b.employment_type)) {
    return NextResponse.json({ error: "กรอกชื่อ อีเมล และประเภทการจ้างให้ครบ" }, { status: 400 });
  }
  const password = String(b.password || b.phone || "0123456789");
  const { data: exists } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (exists) return NextResponse.json({ error: "อีเมลนี้ถูกใช้แล้ว" }, { status: 409 });

  const password_hash = await hashPassword(password);
  const row = {
    title: (b.title || "").trim() || null,
    full_name, email, employment_type: b.employment_type,
    student_id: (b.student_id || "").trim() || null,
    tor_number: (b.tor_number || "").trim() || null,
    phone: (b.phone || "").trim() || null,
    password_hash, role: "user",
  };
  const { data, error } = await supabase.from("users").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH update { id, ...fields, password? }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const upd = {};
  ["title", "full_name", "phone", "student_id", "tor_number"].forEach((k) => {
    if (k in b) upd[k] = (b[k] || "").trim() || null;
  });
  if (b.email) upd.email = String(b.email).trim().toLowerCase();
  if (b.employment_type && TYPES.includes(b.employment_type)) upd.employment_type = b.employment_type;
  if ("active" in b) upd.active = !!b.active;
  if (b.password) upd.password_hash = await hashPassword(String(b.password));

  const { error } = await supabase.from("users").update(upd).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { data: u } = await supabase.from("users").select("role").eq("id", id).maybeSingle();
  if (u?.role === "admin") return NextResponse.json({ error: "ลบบัญชีผู้ดูแลไม่ได้" }, { status: 400 });
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
