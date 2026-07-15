// Shared hours/cost calculations for timesheets.
// Hours come from a section's start_time/end_time; cost = hours * hourly rate;
// the section's expected_cost is the spending cap.

// Parse "HH:MM" (or "H:MM") into minutes since midnight. Returns null if invalid.
function toMinutes(t) {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Hours for one teaching session of a section (end - start), as a decimal.
export function hoursPerDay(startTime, endTime) {
  const a = toMinutes(startTime);
  const b = toMinutes(endTime);
  if (a == null || b == null || b <= a) return 0;
  return Math.round(((b - a) / 60) * 100) / 100; // 2dp
}

// Parse a rate that may be stored as text ("200") or number. Returns 0 if blank.
export function toRate(rate) {
  if (rate == null || rate === "") return 0;
  const n = Number(String(rate).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Cost of a single logged day for a section (from fixed section time).
export function costPerDay(section) {
  const h = hoursPerDay(section.start_time, section.end_time);
  return Math.round(h * toRate(section.rate) * 100) / 100;
}

// Is this section a MODULE (hours entered manually per day)?
// A section counts as MODULE when either:
//   1. the word "module" appears in teaching_type / teaching_days / start_time / end_time, or
//   2. it has NO teaching days AND no teaching time (nothing to derive hours from).
// Module courses have no fixed schedule, so the TA types the hours in manually.
export function isModule(section) {
  if (!section) return false;
  const days = Array.isArray(section.teaching_days)
    ? section.teaching_days.join(" ")
    : section.teaching_days;
  const hay = [section.teaching_type, days, section.start_time, section.end_time]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  if (hay.includes("module")) return true;

  const hasDays = Array.isArray(section.teaching_days)
    ? section.teaching_days.length > 0
    : String(section.teaching_days ?? "").trim() !== "";
  const hasTime =
    String(section.start_time ?? "").trim() !== "" &&
    String(section.end_time ?? "").trim() !== "";
  return !hasDays && !hasTime;
}

// Effective hours for one entry: manual `hours` if present (module), else from time.
export function entryHours(section, entry) {
  if (entry && entry.hours != null && entry.hours !== "") {
    const n = Number(entry.hours);
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return hoursPerDay(section?.start_time, section?.end_time);
}

// Cost of one entry = effective hours × rate.
export function entryCost(section, entry) {
  return Math.round(entryHours(section, entry) * toRate(section?.rate) * 100) / 100;
}

// Budget snapshot for a section given how many days are already logged.
export function budgetInfo(section, loggedDays) {
  const perDay = costPerDay(section);
  const hPerDay = hoursPerDay(section.start_time, section.end_time);
  const budget = section.expected_cost == null ? null : Number(section.expected_cost);
  const usedCost = Math.round(perDay * loggedDays * 100) / 100;
  const usedHours = Math.round(hPerDay * loggedDays * 100) / 100;
  const remainingCost = budget == null ? null : Math.round((budget - usedCost) * 100) / 100;
  // how many more days can still be added without exceeding the budget
  let maxMoreDays = null;
  if (budget != null && perDay > 0) {
    maxMoreDays = Math.max(0, Math.floor((budget - usedCost + 1e-6) / perDay));
  }
  return {
    hoursPerDay: hPerDay,
    costPerDay: perDay,
    rate: toRate(section.rate),
    budget,
    usedCost,
    usedHours,
    remainingCost,
    maxMoreDays,
  };
}

export function thb(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
