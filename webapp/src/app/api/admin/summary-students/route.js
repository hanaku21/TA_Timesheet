import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { entryCost } from "@/lib/calc";
import { selectAll } from "@/lib/selectAll";
import { readSignatories } from "@/lib/signatories";
import { buildStudentSummaryWorkbook, monthRange } from "@/lib/buildStudentSummaryXlsx";

export const runtime = "nodejs";

// GET /api/admin/summary-students?term=<code>
// Whole-term per-student claim summary (.xlsx): sheet "ป.ตรี" (SCHOLARSHIP) and
// sheet "บัณฑิตศึกษา" (TA_RA). Amount per month = ยอดเบิก of the CONFIRMED units
// (ป.ตรี: converted at the scholarship rate, frozen snapshot when present; บัณฑิต: real cost).
// Month columns span the first..last month that has any timesheet data in the term.
export async function GET(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const term = req.nextUrl.searchParams.get("term") || active.code;

  const [entriesRes, subsRes, cfgRes] = await Promise.all([
    selectAll(() =>
      supabase
        .from("timesheet_entries")
        .select(
          `id, work_date, hours, section_id,
           user:users ( id, title, full_name, employment_type, student_id ),
           section:sections ( id, start_time, end_time, rate )`
        )
        .eq("semester", term)
    ),
    supabase.from("submissions").select("user_id, section_id, month").eq("term", term),
    supabase.from("settings").select("key, value").in("key", ["scholarship_rate"]),
  ]);
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (subsRes.error) return NextResponse.json({ error: "submissions: " + subsRes.error.message }, { status: 500 });

  // frozen snapshots (optional column, migration 007)
  let frozenList = [];
  try {
    const { data } = await supabase
      .from("submissions").select("user_id, section_id, month, frozen_rows")
      .eq("term", term).not("frozen_rows", "is", null);
    frozenList = data || [];
  } catch { frozenList = []; }

  const kv = Object.fromEntries((cfgRes.data || []).map((x) => [x.key, x.value]));
  const RATE = Number(kv.scholarship_rate) || 50;
  const round2 = (n) => Math.round(n * 100) / 100;
  const roundHalf = (n) => Math.round(n * 2) / 2;

  const entries = (entriesRes.data || []).filter((e) => e.user && e.section);
  const confirmed = new Set((subsRes.data || []).map((x) => `${x.user_id}|${x.section_id}|${x.month}`));
  const frozenMoney = {};
  frozenList.forEach((x) => {
    if (Array.isArray(x.frozen_rows) && x.frozen_rows.length) {
      frozenMoney[`${x.user_id}|${x.section_id}|${x.month}`] = round2(x.frozen_rows.reduce((a, r) => a + Number(r.money || 0), 0));
    }
  });

  // pool cost per (user, section, month) — confirmed units only
  const pool = {}; // key -> { user, cost }
  entries.forEach((e) => {
    const month = e.work_date.slice(0, 7);
    const key = `${e.user.id}|${e.section.id}|${month}`;
    if (!confirmed.has(key)) return;
    if (!pool[key]) pool[key] = { user: e.user, month, cost: 0, billedHours: 0 };
    const money = entryCost(e.section, e);
    pool[key].cost = round2(pool[key].cost + money);
    // same pooling as the admin overview "เบิกได้" badge (ทุน ป.ตรี)
    pool[key].billedHours = round2(pool[key].billedHours + round2(money / RATE));
  });

  // per user per month ยอดเบิก
  const byUser = {}; // uid -> { user, byMonth }
  Object.entries(pool).forEach(([key, p]) => {
    const u = p.user;
    const isSch = u.employment_type === "SCHOLARSHIP";
    const money = isSch
      ? (frozenMoney[key] != null ? frozenMoney[key] : round2(roundHalf(p.billedHours) * RATE))
      : p.cost;
    if (!byUser[u.id]) byUser[u.id] = { user: u, byMonth: {} };
    byUser[u.id].byMonth[p.month] = round2((byUser[u.id].byMonth[p.month] || 0) + money);
  });
  // month range = first..last month that actually has a confirmed amount
  // (months with no logging / no confirmation at the end are not shown)
  const usedMonths = Object.values(pool).map((p) => p.month).sort();
  const months = monthRange(usedMonths[0], usedMonths[usedMonths.length - 1]);

  const sortTh = (a, b) => (a.user.full_name || "").localeCompare(b.user.full_name || "", "th");
  const ug = Object.values(byUser).filter((x) => x.user.employment_type === "SCHOLARSHIP").sort(sortTh);
  const grad = Object.values(byUser).filter((x) => x.user.employment_type === "TA_RA").sort(sortTh);

  const { f07 } = await readSignatories(supabase);
  const buffer = await buildStudentSummaryWorkbook({ ug, grad, months, term, f07 });

  const filename = `สรุปยอดเบิกรายคน_${String(term).replace("/", "-")}.xlsx`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
    },
  });
}
