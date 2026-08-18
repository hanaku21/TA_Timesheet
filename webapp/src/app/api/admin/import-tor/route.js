import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";

const clean = (s) => (s == null ? "" : String(s).trim());

// Accept dd/MM/yyyy, yyyy-MM-dd, or a Buddhist year and normalise to yyyy-MM-dd.
function toISODate(s) {
  const v = clean(s);
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    y = Number(y);
    if (y > 2400) y -= 543; // Buddhist -> Gregorian
    if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}
const toNum = (s) => {
  const n = Number(clean(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// POST /api/admin/import-tor  (multipart: file=<csv>, term=<code>)
// Columns (Thai): เลข TOR, วันเริ่มงาน, ระยะเวลา (วัน), วันสิ้นสุด, ยอดสั่งจ้าง, หมายเหตุ
export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file) return NextResponse.json({ error: "กรุณาเลือกไฟล์ CSV" }, { status: 400 });

  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const term = clean(form.get("term")) || active.code;

  const text = (await file.text()).replace(/^﻿/, "");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true }).data || [];

  const rows = [];
  const skipped = [];
  for (const r of parsed) {
    const tor = clean(r["เลข TOR"]);
    if (!tor) continue;
    const start_date = toISODate(r["วันเริ่มงาน"]);
    const end_date = toISODate(r["วันสิ้นสุด"]);
    if (!start_date && !end_date) { skipped.push(tor); continue; }
    rows.push({
      tor_number: tor,
      term,
      start_date,
      end_date,
      duration_days: toNum(r["ระยะเวลา (วัน)"]),
      amount: toNum(r["ยอดสั่งจ้าง"]),
      note: clean(r["หมายเหตุ"]) || null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูล TOR ที่ถูกต้องในไฟล์" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tor_periods")
    .upsert(rows, { onConflict: "tor_number,term" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // How many of these TOR numbers actually match a section this term (informational).
  const { data: secs } = await supabase
    .from("sections")
    .select("tor_number")
    .eq("semester", term)
    .not("tor_number", "is", null);
  const secTors = new Set((secs || []).map((s) => s.tor_number));
  const matched = rows.filter((r) => secTors.has(r.tor_number)).length;

  return NextResponse.json({
    ok: true,
    term,
    imported: rows.length,
    matchedSections: matched,
    unmatched: rows.length - matched,
    skipped: skipped.length,
  });
}
