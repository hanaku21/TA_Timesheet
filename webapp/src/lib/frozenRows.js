import { computeDisplayRows } from "@/lib/buildTimesheetXlsx";

// ทุน ป.ตรี (SCHOLARSHIP) document rows are redistributed at export time, so
// their dates can shift if another section or the pay config changes. When a
// section is confirmed we snapshot its rows; exports then use the snapshot so
// the confirmed document's dates stay frozen.

// Replace live rows of any snapshotted section with the frozen rows.
// frozenList: [{ section_id, rows: [...] }]
export function mergeFrozenRows(liveRows, frozenList) {
  if (!frozenList || frozenList.length === 0) return liveRows || [];
  const ids = new Set(frozenList.map((f) => String(f.section_id)));
  const kept = (liveRows || []).filter((r) => !ids.has(String(r.section?.id)));
  const injected = frozenList.flatMap((f) => f.rows || []);
  return [...kept, ...injected].sort((a, b) => (a.work_date || "").localeCompare(b.work_date || ""));
}

// Frozen snapshots for one user's month (only sections that were confirmed
// while carrying a snapshot).
export async function fetchFrozenRows(supabase, userId, term, month) {
  const { data } = await supabase
    .from("submissions")
    .select("section_id, frozen_rows")
    .eq("user_id", userId)
    .eq("term", term)
    .eq("month", month)
    .not("frozen_rows", "is", null);
  return (data || [])
    .filter((s) => Array.isArray(s.frozen_rows) && s.frozen_rows.length > 0)
    .map((s) => ({ section_id: s.section_id, rows: s.frozen_rows }));
}

// Compute a user's full redistributed display rows for a month (same inputs the
// export routes use). Used at confirm time to snapshot one section.
export async function computeUserDisplayRows(supabase, user, term, month) {
  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("timesheet_entries")
    .select(
      `id, work_date, remark, hours,
       section:sections (
         id, section, teaching_type, start_time, end_time, rate, curriculum_id,
         course:courses ( code, name ),
         curriculum:curricula ( code, name )
       )`
    )
    .eq("user_id", user.id)
    .eq("semester", term)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date");

  const { data: blackouts } = await supabase
    .from("blackout_periods")
    .select("start_date, end_date, blackout_curricula ( curriculum_id )");
  const blk = (blackouts || []).map((b) => ({
    start_date: b.start_date,
    end_date: b.end_date,
    curriculum_ids: (b.blackout_curricula || []).map((c) => c.curriculum_id),
  }));

  const { data: cfg } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["scholarship_rate", "scholarship_max_hours"]);
  const kv = Object.fromEntries((cfg || []).map((s) => [s.key, s.value]));
  const payConfig = {
    rate: Number(kv.scholarship_rate) || 50,
    maxHours: Number(kv.scholarship_max_hours) || 8,
  };

  return computeDisplayRows({ user, rows: rows || [], month, blackouts: blk, payConfig });
}
