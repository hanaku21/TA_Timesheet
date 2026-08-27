import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { computeUserDisplayRows } from "@/lib/frozenRows";

export const runtime = "nodejs";

// POST /api/admin/submissions  { user_id, section_id, month, term? }
// Confirm (freeze) a section+month on behalf of a user.
export async function POST(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const b = await req.json().catch(() => ({}));
  const { user_id, section_id, month } = b;
  if (!user_id || !section_id || !month) {
    return NextResponse.json({ error: "missing user_id / section_id / month" }, { status: 400 });
  }
  const active = await getActiveTerm(supabase);
  const term = b.term || active.code;

  // Base confirmation (works even if the frozen_rows column doesn't exist yet).
  const { error } = await supabase
    .from("submissions")
    .upsert(
      { user_id, section_id, term, month, confirmed_at: new Date().toISOString() },
      { onConflict: "user_id,term,month,section_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: freeze ทุน ป.ตรี document rows (no-op if column absent).
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, title, full_name, employment_type, tor_number, student_id")
      .eq("id", user_id)
      .maybeSingle();
    if (user?.employment_type === "SCHOLARSHIP") {
      const all = await computeUserDisplayRows(supabase, user, term, month);
      const frozenRows = all.filter((r) => String(r.section?.id) === String(section_id));
      await supabase
        .from("submissions")
        .update({ frozen_rows: frozenRows })
        .eq("user_id", user_id).eq("term", term).eq("month", month).eq("section_id", section_id);
    }
  } catch { /* freeze is optional */ }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/submissions?user_id=&section_id=&month=YYYY-MM&term=
// Reject a submission → unfreezes that section+month so the user can edit again.
export async function DELETE(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  const sectionId = sp.get("section_id");
  const month = sp.get("month");
  if (!userId || !sectionId || !month) {
    return NextResponse.json({ error: "missing user_id / section_id / month" }, { status: 400 });
  }
  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("user_id", userId)
    .eq("section_id", sectionId)
    .eq("term", term)
    .eq("month", month);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
