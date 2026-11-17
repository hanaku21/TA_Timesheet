import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { entryCost } from "@/lib/calc";
import { selectAll } from "@/lib/selectAll";
import { EMP_LABELS } from "@/lib/constants";
import { buildCostSummaryWorkbook } from "@/lib/buildCostSummaryXlsx";
import { readSignatories } from "@/lib/signatories";

export const runtime = "nodejs";

// GET /api/admin/summary?month=YYYY-MM&term=<code>&curriculum=<id>&type=<emp>
// Downloads an .xlsx cost summary for the month, broken down by employment
// type — ONLY confirmed (ยืนยันนำส่งแล้ว) user×section units of that month.
// Same data + scholarship conversion as the admin overview.
export async function GET(req) {
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabase();
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "รูปแบบเดือนไม่ถูกต้อง" }, { status: 400 });
  const curriculum = sp.get("curriculum") || "";
  const type = sp.get("type") || "";

  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;

  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

  const [entriesRes, subsRes, cfgRes, curRes] = await Promise.all([
    // paged: a busy month can pass PostgREST's 1,000-row cap
    selectAll(() => supabase
      .from("timesheet_entries")
      .select(
        `id, work_date, remark, hours,
         user:users ( id, title, full_name, employment_type, email, student_id, tor_number ),
         section:sections (
           id, section, teaching_type, curriculum_id, start_time, end_time, rate, tor_number,
           course:courses ( code, name ),
           curriculum:curricula ( id, code, name )
         )`
      )
      .eq("semester", term)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd)),
    supabase.from("submissions").select("user_id, section_id").eq("term", term).eq("month", month),
    supabase.from("settings").select("key, value").in("key", ["scholarship_rate"]),
    supabase.from("curricula").select("id, code"),
  ]);
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (subsRes.error) return NextResponse.json({ error: "submissions: " + subsRes.error.message }, { status: 500 });

  // frozen_rows (migration 007) is optional — fetch separately so a missing
  // column can't blank out the confirmed list.
  let frozenList = [];
  try {
    const { data } = await supabase
      .from("submissions").select("user_id, section_id, frozen_rows")
      .eq("term", term).eq("month", month).not("frozen_rows", "is", null);
    frozenList = data || [];
  } catch { frozenList = []; }

  let rows = (entriesRes.data || []).sort((a, b) => a.work_date.localeCompare(b.work_date) || a.id - b.id);
  if (curriculum) rows = rows.filter((r) => String(r.section?.curriculum_id) === String(curriculum));
  if (type) rows = rows.filter((r) => r.user?.employment_type === type);

  // ---- scholarship conversion (same rule as /api/admin/timesheets) ----
  const kv = Object.fromEntries((cfgRes.data || []).map((x) => [x.key, x.value]));
  const RATE = Number(kv.scholarship_rate) || 50;
  const round2 = (n) => Math.round(n * 100) / 100;
  const roundHalf = (n) => Math.round(n * 2) / 2;

  const confirmed = new Set((subsRes.data || []).map((x) => `${x.user_id}|${x.section_id}`));
  const frozenBy = {};
  frozenList.forEach((x) => {
    if (Array.isArray(x.frozen_rows) && x.frozen_rows.length) {
      frozenBy[`${x.user_id}|${x.section_id}`] = {
        hours: round2(x.frozen_rows.reduce((a, r) => a + Number(r.hours || 0), 0)),
        money: round2(x.frozen_rows.reduce((a, r) => a + Number(r.money || 0), 0)),
      };
    }
  });
  // Only units the TA (or admin) has confirmed for this month are included.
  rows = rows.filter((r) => confirmed.has(`${r.user?.id}|${r.section?.id}`));

  const poolBy = {};
  rows.forEach((r) => {
    if (r.user?.employment_type !== "SCHOLARSHIP") return;
    const key = `${r.user.id}|${r.section?.id}`;
    poolBy[key] = round2((poolBy[key] || 0) + round2(entryCost(r.section, r) / RATE));
  });
  const converted = {};
  Object.keys(poolBy).forEach((key) => {
    if (frozenBy[key]) { converted[key] = frozenBy[key]; return; }
    const hours = roundHalf(poolBy[key]);
    converted[key] = { hours, money: round2(hours * RATE) };
  });

  // ---- budget (whole term) for EVERY section assigned to TAs of the selected type/curriculum ----
  // Not limited to the sections confirmed this month, so งบเต็ม / ใช้ไปทั้งเทอม / คงเหลือ
  // in the per-type table describe the whole term (and match the whole-term files).
  const budgets = {};          // sid -> { budget, used, remaining }  (used in the detail rows)
  const termBudgetByType = {}; // emp -> { budget, used, remaining } (used in the per-type table)
  {
    const assignsRes = await supabase
      .from("assignments")
      .select(`section_id, user:users ( id, employment_type, active, role ), section:sections ( id, expected_cost, curriculum_id )`)
      .eq("semester", term);
    let assigns = (assignsRes.data || []).filter((a) => a.user && a.section && a.user.active !== false && a.user.role === "user");
    if (curriculum) assigns = assigns.filter((a) => String(a.section.curriculum_id) === String(curriculum));
    if (type) assigns = assigns.filter((a) => a.user.employment_type === type);
    const secType = {}; // sid -> employment_type of the assigned TA
    assigns.forEach((a) => { if (!secType[a.section.id]) secType[a.section.id] = a.user.employment_type; });
    const sectionIds = Object.keys(secType).map(Number);
    if (sectionIds.length) {
      const termEntRes = await selectAll(() =>
        supabase
          .from("timesheet_entries")
          .select("id, section_id, hours, section:sections ( start_time, end_time, rate )")
          .eq("semester", term)
          .in("section_id", sectionIds)
      );
      const used = {};
      const billed = {};
      (termEntRes.data || []).forEach((e) => {
        if (!e.section) return;
        const c = entryCost(e.section, e);
        used[e.section_id] = round2((used[e.section_id] || 0) + c);
        billed[e.section_id] = round2((billed[e.section_id] || 0) + round2(c / RATE));
      });
      assigns.forEach((a) => {
        const sec = a.section;
        if (budgets[sec.id]) return;
        const emp = secType[sec.id];
        const budget = sec.expected_cost == null ? null : Number(sec.expected_cost);
        // ทุน ป.ตรี -> "ใช้ไป" is the claimable amount (converted), other types = real cost
        const u = emp === "SCHOLARSHIP" ? round2(roundHalf(billed[sec.id] || 0) * RATE) : (used[sec.id] || 0);
        budgets[sec.id] = { budget, used: u, remaining: budget == null ? null : round2(budget - u) };
        const t = termBudgetByType[emp] || (termBudgetByType[emp] = { budget: 0, used: 0, remaining: 0 });
        t.used = round2(t.used + u);
        if (budget != null) { t.budget = round2(t.budget + budget); t.remaining = round2(t.remaining + (budget - u)); }
      });
    }
  }

  const curLabel = curriculum
    ? (curRes.data || []).find((c) => String(c.id) === String(curriculum))?.code || curriculum
    : "";

  const { f07 } = await readSignatories(supabase);

  const buffer = await buildCostSummaryWorkbook({
    rows, converted, confirmed, budgets, termBudgetByType, term, month, scholarshipRate: RATE, f07,
    filters: { curriculumLabel: curLabel, typeLabel: type ? EMP_LABELS[type] || type : "" },
  });

  const [ynum, mnum] = month.split("-");
  const parts = ["สรุปค่าใช้จ่าย_แยกประเภท", term.replace("/", "-"), `${mnum}_${ynum}`];
  if (curLabel) parts.push(curLabel);
  if (type) parts.push(type);
  const filename = parts.join("_").replace(/[\\/:*?"<>|]+/g, "_") + ".xlsx";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
    },
  });
}
