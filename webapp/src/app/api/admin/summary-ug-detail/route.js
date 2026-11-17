import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { entryCost, entryHours } from "@/lib/calc";
import { selectAll } from "@/lib/selectAll";
import { readSignatories } from "@/lib/signatories";
import { buildUgDetailWorkbook } from "@/lib/buildUgDetailXlsx";

export const runtime = "nodejs";

// GET /api/admin/summary-ug-detail?term=<code>
// ทุน ป.ตรี (SCHOLARSHIP) whole-term detail: one row per student × month × course/section with
// days (ครั้ง), document days, real hours, converted hours, real money, ยอดเบิก, section budget, status.
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
           section:sections ( id, section, start_time, end_time, rate, expected_cost, course:courses ( code, name ) )`
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

  // frozen document rows (optional column, migration 007)
  const frozen = {}; // uid|sid|month -> { hours, money, days }
  try {
    const { data } = await supabase
      .from("submissions").select("user_id, section_id, month, frozen_rows")
      .eq("term", term).not("frozen_rows", "is", null);
    (data || []).forEach((x) => {
      if (Array.isArray(x.frozen_rows) && x.frozen_rows.length) {
        frozen[`${x.user_id}|${x.section_id}|${x.month}`] = {
          hours: round2(x.frozen_rows.reduce((a, r) => a + Number(r.hours || 0), 0)),
          money: round2(x.frozen_rows.reduce((a, r) => a + Number(r.money || 0), 0)),
          days: new Set(x.frozen_rows.map((r) => r.work_date)).size,
        };
      }
    });
  } catch { /* column missing */ }

  const units = {}; // uid|sid|month -> accumulators
  const byUser = {};
  (entriesRes.data || []).forEach((e) => {
    if (!e.user || !e.section || e.user.employment_type !== "SCHOLARSHIP") return;
    const month = e.work_date.slice(0, 7);
    const key = `${e.user.id}|${e.section.id}|${month}`;
    if (!units[key]) {
      units[key] = { uid: e.user.id, month, section: e.section, days: 0, hours: 0, cost: 0, billed: 0 };
      byUser[e.user.id] = byUser[e.user.id] || { user: e.user, keys: [] };
      byUser[e.user.id].keys.push(key);
    }
    const u = units[key];
    const c = entryCost(e.section, e);
    u.days += 1;
    u.hours = round2(u.hours + entryHours(e.section, e));
    u.cost = round2(u.cost + c);
    u.billed = round2(u.billed + round2(c / RATE));
  });

  // how many sections does each course have (for the "ตอน" label, like F-07)
  const secCount = {};
  Object.values(units).forEach((u) => {
    const code = u.section.course?.code || "";
    secCount[code] = secCount[code] || new Set();
    secCount[code].add(u.section.id);
  });

  const people = Object.values(byUser)
    .sort((a, b) => (a.user.full_name || "").localeCompare(b.user.full_name || "", "th"))
    .map(({ user, keys }) => {
      const rows = keys.map((key) => {
        const u = units[key];
        const fz = frozen[key];
        const convHours = fz ? fz.hours : roundHalf(u.billed);
        const convMoney = fz ? fz.money : round2(convHours * RATE);
        const code = u.section.course?.code || "";
        const label = secCount[code]?.size > 1 ? `${code} ตอน ${u.section.section}` : code;
        return {
          month: u.month, code, section: u.section.section, label,
          days: u.days, docDays: fz ? fz.days : null,
          hours: u.hours, convHours, cost: u.cost, convMoney,
          budget: u.section.expected_cost == null ? null : Number(u.section.expected_cost),
          confirmed: confirmed.has(key),
        };
      });
      // order: course/section first, then month within each course
      rows.sort((a, b) => a.code.localeCompare(b.code) || String(a.section).localeCompare(String(b.section)) || a.month.localeCompare(b.month));
      return { user, rows };
    });

  const { f07 } = await readSignatories(supabase);
  const buffer = await buildUgDetailWorkbook({ people, term, scholarshipRate: RATE, f07 });

  const filename = `สรุปทุนปตรี_รายวิชา-รายเดือน_${String(term).replace("/", "-")}.xlsx`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ug_detail.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
