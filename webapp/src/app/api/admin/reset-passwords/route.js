import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const DEFAULT_PW = "0123456789";

// POST { confirm: "RESET" } — set every non-admin user's password to their phone
// number (or "0123456789" if they have none). Bcrypt-hashed server-side.
export async function POST(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body = {};
  try { body = await req.json(); } catch {}
  if (body.confirm !== "RESET") {
    return NextResponse.json({ error: 'กรุณายืนยันด้วยการพิมพ์ "RESET"' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: users, error } = await supabase
    .from("users")
    .select("id, phone")
    .neq("role", "admin");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  let usedDefault = 0;
  for (const u of users || []) {
    const phone = (u.phone || "").trim();
    const pw = phone || DEFAULT_PW;
    if (!phone) usedDefault++;
    const password_hash = await hashPassword(pw);
    const { error: e2 } = await supabase.from("users").update({ password_hash }).eq("id", u.id);
    if (!e2) updated++;
  }

  return NextResponse.json({ ok: true, updated, usedDefault, total: (users || []).length });
}
