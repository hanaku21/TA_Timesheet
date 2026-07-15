import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyPassword, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", String(email).trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("[login] supabase error:", error);
      return NextResponse.json({ error: "DB error: " + error.message }, { status: 500 });
    }
    if (!user) return NextResponse.json({ error: "ไม่พบอีเมลนี้ในระบบ" }, { status: 401 });
    if (user.active === false) {
      return NextResponse.json({ error: "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, { status: 403 });
    }

    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });

    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (e) {
    console.error("[login] unhandled:", e);
    return NextResponse.json({ error: "Server error: " + (e?.message || String(e)) }, { status: 500 });
  }
}
