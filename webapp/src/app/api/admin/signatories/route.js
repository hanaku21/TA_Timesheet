import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { readSignatories } from "@/lib/signatories";

export const runtime = "nodejs";

async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  return NextResponse.json(await readSignatories(supabase));
}

export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json().catch(() => ({}));
  const s = (v) => (v == null ? "" : String(v).trim());
  const rows = [
    { key: "sign_enabled", value: b.enabled ? "1" : "0" },
    { key: "sign_head_name", value: s(b.head?.name) },
    { key: "sign_head_position", value: s(b.head?.position) },
    { key: "sign_approver_name", value: s(b.approver?.name) },
    { key: "sign_approver_position", value: s(b.approver?.position) },
  ];
  if (b.f07) {
    rows.push(
      { key: "f07_notice_date_grad", value: s(b.f07.noticeDateGrad) },
      { key: "f07_notice_date_ug", value: s(b.f07.noticeDateUg) },
      { key: "f07_notice_date_tor", value: s(b.f07.noticeDateTor) },
      { key: "f07_preparer", value: s(b.f07.preparer) },
      { key: "f07_certifier", value: s(b.f07.certifier) },
    );
  }
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
