import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/announcements — active announcements for the logged-in user's dashboard modal.
// Returns [] (never an error) when the table doesn't exist yet (migration 008).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  // master switch (settings.announce_enabled, default on)
  const { data: sw } = await supabase.from("settings").select("value").eq("key", "announce_enabled").maybeSingle();
  if (sw && sw.value === "0") return NextResponse.json({ items: [] });
  const { data, error } = await supabase
    .from("announcements")
    .select("id, kind, title, body, image_data, link_url, sort_order")
    .eq("active", true)
    .order("sort_order")
    .order("id");
  if (error) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: data || [] });
}
