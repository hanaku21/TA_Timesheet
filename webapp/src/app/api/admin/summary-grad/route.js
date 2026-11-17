import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { entryCost, entryHours } from "@/lib/calc";
import { selectAll } from "@/lib/selectAll";
import { readSignatories } from "@/lib/signatories";
import { buildTotalsWorkbook } from "@/lib/buildGradTotalsXlsx";

export const runtime = "nodejs";

// GET /api/admin/summary-grad?term=<code>[&all=1]
// Whole-term per-person totals: sheet ป.ตรี (SCHOLARSHIP — converted hours/amount at the scholarship
// rate, frozen snapshot when confirmed) + sheet บัณฑิตศึกษา (TA_RA — real hours × rate): hours, days (ครั้ง),
// money, every month of the term added together. Default = CONFIRMED units only; all=1 = everything logged.
export async function GET(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const active = await getActiveTerm(supabase);
  const term = req.nextUrl.searchParams.get("term") || active.code;
  const includeAll = req.nextUrl.searchParams.get("all") === "1";

  const [entriesRes, subsRes, cfgRes] = await Promise.all([
    selectAll(() =>
      supabase
        .from("timesheet_entries")
        .select(
          `id, work_date, hours, section_id,
           user:users ( id, title, full_name, employment_type, student_id, active ),
           section:sections ( id, start_time, end_time, rate )`
        )
        .eq("semester", term)
    ),
    supabase.from("submissions").select("user_id, section_id, month").eq("term", term),
    supabase.from("settings").select("key, value").eq("key", "scholarship_rate"),
  ]);
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (subsRes.error) return NextResponse.json({ error: "submissions: " + subsRes.error.message }, { status: 500 });

  const round2 = (n) => Math.round(n * 100) / 100;
  const roundHalf = (n) => Math.round(n * 2) / 2;
  const RATE = Number(cfgRes.data?.[0]?.value) || 50;
  const confirmed = new Set((subsRes.data || []).map((x) => `${x.user_id}|${x.section_id}|${x.month}`));

  // frozen snapshots for ทุน ป.ตรี (optional column, migration 007)
  const frozen = {}; // uid|sid|month -> { hours, money }
  try {
    const { data } = await supabase
      .from("submissions").select("user_id, section_id, month, frozen_rows")
      .eq("term", term).not("frozen_rows", "is", null);
    (data || []).forEach((x) => {
      if (Array.isArray(x.frozen_rows) && x.frozen_rows.length) {
        frozen[`${x.user_id}|${x.section_id}|${x.month}`] = {
          hours: round2(x.frozen_rows.reduce((a, r) => a + Number(r.hours || 0), 0)),
          money: round2(x.frozen_rows.reduce((a, r) => a + Number(r.money || 0), 0)),
        };
      }
    });
  } catch { /* column missing -> compute from entries */ }

  const gradBy = {}; // uid -> { user, hours, days, money }
  const schPool = {}; // uid|sid|month -> { user, billedHours, days }
  const monthsSeen = [];
  (entriesRes.data || []).forEach((e) => {
    if (!e.user || !e.section) return;
    const type = e.user.employment_type;
    if (type !== "TA_RA" && type !== "SCHOLARSHIP") return;
    const month = e.work_date.slice(0, 7);
    const key = `${e.user.id}|${e.section.id}|${month}`;
    if (!includeAll && !confirmed.has(key)) return;
    monthsSeen.push(month);
    if (type === "TA_RA") {
      if (!gradBy[e.user.id]) gradBy[e.user.id] = { user: e.user, hours: 0, days: 0, money: 0 };
      const b = gradBy[e.user.id];
      b.hours = round2(b.hours + entryHours(e.section, e));
      b.days += 1;
      b.money = round2(b.money + entryCost(e.section, e));
    } else {
      if (!schPool[key]) schPool[key] = { user: e.user, billedHours: 0, days: 0 };
      schPool[key].billedHours = round2(schPool[key].billedHours + round2(entryCost(e.section, e) / RATE));
      schPool[key].days += 1;
    }
  });
  // ทุน ป.ตรี: convert per (user, section, month) like the admin overview, then add up per person
  const ugBy = {};
  Object.entries(schPool).forEach(([key, p]) => {
    const conv = frozen[key] || { hours: roundHalf(p.billedHours), money: round2(roundHalf(p.billedHours) * RATE) };
    if (!ugBy[p.user.id]) ugBy[p.user.id] = { user: p.user, hours: 0, days: 0, money: 0 };
    const b = ugBy[p.user.id];
    b.hours = round2(b.hours + conv.hours);
    b.days += p.days;
    b.money = round2(b.money + conv.money);
  });
  monthsSeen.sort();
  const sortTh = (a, b) => (a.user.full_name || "").localeCompare(b.user.full_name || "", "th");
  const ug = Object.values(ugBy).sort(sortTh);
  const grad = Object.values(gradBy).sort(sortTh);

  const { f07 } = await readSignatories(supabase);
  const buffer = await buildTotalsWorkbook({
    ug, grad, term, f07,
    firstMonth: monthsSeen[0], lastMonth: monthsSeen[monthsSeen.length - 1],
    confirmedOnly: !includeAll, scholarshipRate: RATE,
  });

  const filename = `สรุปรวมรายคน_ชม-ครั้ง-เงิน_${String(term).replace("/", "-")}.xlsx`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="totals.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
