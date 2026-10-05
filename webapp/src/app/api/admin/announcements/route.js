import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB of base64

async function requireAdmin() {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}
const clean = (v) => (v == null ? "" : String(v).trim());

// GET — all announcements (active + inactive)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { data: sw } = await supabase.from("settings").select("value").eq("key", "announce_enabled").maybeSingle();
  const enabled = !(sw && sw.value === "0");
  const { data, error } = await supabase
    .from("announcements")
    .select("id, kind, title, body, image_data, link_url, active, sort_order, created_at")
    .order("sort_order")
    .order("id");
  if (error) {
    const missing = /announcements/.test(error.message) && /not exist|schema cache|find the table/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "ยังไม่มีตาราง announcements — กรุณารัน supabase/migrations/008_announcements.sql ใน Supabase SQL Editor" : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ items: data || [], enabled });
}

// PUT { enabled: boolean } — master switch: show / hide the whole slideshow
export async function PUT(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json().catch(() => ({}));
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "announce_enabled", value: b.enabled ? "1" : "0" }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: !!b.enabled });
}

// POST { kind: "text"|"image", title?, body?, image_data?, link_url? }
export async function POST(req) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "image" ? "image" : "text";
  const title = clean(b.title) || null;
  const body = clean(b.body) || null;
  const image_data = clean(b.image_data) || null;
  const link_url = clean(b.link_url) || null;

  if (kind === "text" && !title && !body) {
    return NextResponse.json({ error: "กรุณากรอกหัวข้อหรือข้อความ" }, { status: 400 });
  }
  if (kind === "image") {
    if (!image_data || !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(image_data)) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์รูปภาพ (png/jpg/gif/webp)" }, { status: 400 });
    }
    if (image_data.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "รูปใหญ่เกินไป (เกิน ~1.5 MB หลังย่อ) กรุณาใช้รูปที่เล็กกว่า" }, { status: 400 });
    }
  }

  // append at the end
  const { data: last } = await supabase
    .from("announcements").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("announcements")
    .insert({ kind, title, body, image_data: kind === "image" ? image_data : null, link_url, sort_order, created_by: s.uid, active: true })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH { id, title?, body?, link_url?, active?, move?: "up"|"down" }
export async function PATCH(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  if (b.move === "up" || b.move === "down") {
    const { data: all } = await supabase.from("announcements").select("id, sort_order").order("sort_order").order("id");
    const list = all || [];
    const i = list.findIndex((x) => String(x.id) === String(b.id));
    const j = b.move === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return NextResponse.json({ ok: true });
    // normalise to 0..n-1 then swap
    const order = list.map((x, k) => ({ id: x.id, sort_order: k }));
    [order[i].sort_order, order[j].sort_order] = [order[j].sort_order, order[i].sort_order];
    for (const o of order) await supabase.from("announcements").update({ sort_order: o.sort_order }).eq("id", o.id);
    return NextResponse.json({ ok: true });
  }

  const upd = {};
  if ("title" in b) upd.title = clean(b.title) || null;
  if ("body" in b) upd.body = clean(b.body) || null;
  if ("link_url" in b) upd.link_url = clean(b.link_url) || null;
  if ("active" in b) upd.active = !!b.active;
  const { error } = await supabase.from("announcements").update(upd).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
