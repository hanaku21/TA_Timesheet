"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ymd } from "@/lib/constants";
import { hoursPerDay, costPerDay, thb, isModule, entryCost, entryHours, toRate } from "@/lib/calc";
import { localeFromName, makeT, monthLabel, WEEKDAYS } from "@/lib/i18n";
import { SaveIcon } from "@/components/Icons";
import { fetchTimesheet, invalidateTimesheet } from "@/lib/timesheetCache";

function monthMatrix(year, month0) {
  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const days = new Date(year, month0 + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month0, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function TimesheetClient({ name, employmentType, initialSectionId }) {
  const locale = localeFromName(name);
  const t = makeT(locale);
  const isScholarship = employmentType === "SCHOLARSHIP"; // ป.ตรี: no remark field
  const WD = WEEKDAYS[locale];
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState(null);
  const [sectionId, setSectionId] = useState("");
  const [picked, setPicked] = useState([]); // ordered array of "YYYY-MM-DD"
  const [remarks, setRemarks] = useState({}); // { date: remark }
  const [hoursByDate, setHoursByDate] = useState({}); // { date: hours } for MODULE sections
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  // inline edit of an already-saved entry
  const [editId, setEditId] = useState(null);
  const [editRemark, setEditRemark] = useState("");
  const [editHours, setEditHours] = useState("");

  const load = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    const d = await fetchTimesheet({ force });
    setData(d);
    if (!sectionId && d.sections?.length) {
      const wanted = initialSectionId && d.sections.find((s) => String(s.id) === String(initialSectionId));
      setSectionId(String(wanted ? wanted.id : d.sections[0].id));
    }
    setLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPicked([]); setRemarks({}); setHoursByDate({}); setMsg(null); }, [month, sectionId]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  const [yy, mm] = month.split("-").map(Number);
  const weeks = useMemo(() => monthMatrix(yy, mm - 1), [yy, mm]);

  const section = data?.sections?.find((s) => String(s.id) === String(sectionId));
  const curriculumId = section?.curriculum_id;

  const allEntries = data?.entries || [];
  // entries of selected section (all time) -> for budget
  const sectionEntries = useMemo(
    () => allEntries.filter((e) => String(e.section_id) === String(sectionId)),
    [allEntries, sectionId]
  );
  const loggedForSection = useMemo(() => {
    const m = {};
    sectionEntries.forEach((e) => (m[e.work_date] = e));
    return m;
  }, [sectionEntries]);

  const semStart = data?.semester?.start;
  const semEnd = data?.semester?.end;

  function blackoutFor(dateStr) {
    return (data?.blackouts || []).find((b) => {
      if (dateStr < b.start_date || dateStr > b.end_date) return false;
      return b.curriculum_ids.length === 0 || b.curriculum_ids.includes(curriculumId);
    });
  }

  // ---- budget snapshot (entry-aware; supports MODULE manual hours) ----
  const moduleSec = section ? isModule(section) : false;
  const perDayCost = section ? costPerDay(section) : 0;         // fixed sections
  const hPerDay = section ? hoursPerDay(section.start_time, section.end_time) : 0;
  const rate = section ? toRate(section.rate) : 0;
  const budgetTotal = section && section.expected_cost != null ? Number(section.expected_cost) : null;
  const usedCost = section
    ? Math.round(sectionEntries.reduce((a, e) => a + entryCost(section, e), 0) * 100) / 100
    : 0;
  const pickedCost = section
    ? Math.round(picked.reduce((a, d) => a + entryCost(section, { hours: hoursByDate[d] }), 0) * 100) / 100
    : 0;
  const pickedHours = section
    ? Math.round(picked.reduce((a, d) => a + entryHours(section, { hours: hoursByDate[d] }), 0) * 100) / 100
    : 0;
  const projectedUsed = Math.round((usedCost + pickedCost) * 100) / 100;
  const remainingCost = budgetTotal != null ? Math.round((budgetTotal - usedCost) * 100) / 100 : null;
  // for MODULE: how many more hours can still be entered within budget
  const remainingHours = moduleSec && rate > 0 && remainingCost != null
    ? Math.max(0, Math.floor((remainingCost / rate) * 100) / 100)
    : null;
  const overBudget = budgetTotal != null && projectedUsed > budgetTotal + 1e-6;

  function dateState(d) {
    if (!d) return { kind: "empty" };
    const s = ymd(d);
    if (semStart && s < semStart) return { kind: "out" };
    if (semEnd && s > semEnd) return { kind: "out" };
    if (loggedForSection[s]) return { kind: "logged", entry: loggedForSection[s] };
    const b = blackoutFor(s);
    if (b) return { kind: "blackout", reason: b.reason };
    if (pickedSet.has(s)) return { kind: "selected" };
    return { kind: "open" };
  }

  function removePick(s) {
    setPicked(picked.filter((x) => x !== s));
    setRemarks((r) => { const n = { ...r }; delete n[s]; return n; });
    setHoursByDate((r) => { const n = { ...r }; delete n[s]; return n; });
  }

  function toggle(d) {
    const st = dateState(d);
    if (!["open", "selected"].includes(st.kind)) return;
    const s = ymd(d);
    if (pickedSet.has(s)) { removePick(s); setMsg(null); return; }
    // budget block on selection (fixed sections only; module hours entered later)
    if (!moduleSec && budgetTotal != null && perDayCost > 0) {
      const wouldUse = usedCost + perDayCost * (picked.length + 1);
      if (wouldUse > budgetTotal + 1e-6) {
        const maxMore = Math.max(0, Math.floor((budgetTotal - usedCost + 1e-6) / perDayCost));
        setMsg({ type: "error", text: t("maxMoreDays", { n: maxMore }) });
        return;
      }
    }
    setMsg(null);
    setPicked([...picked, s]);
  }

  // save all selected days at once
  async function saveAll() {
    if (picked.length === 0) return;
    // validate every picked day
    for (const day of picked) {
      const v = hoursByDate[day];
      const hasHours = v !== undefined && String(v).trim() !== "";
      if (moduleSec && !(Number(v) > 0)) {
        setMsg({ type: "error", text: t("needHours", { date: day }) });
        return;
      }
      if (hasHours && !(Number(v) > 0)) {
        setMsg({ type: "error", text: t("hoursPositive") });
        return;
      }
    }
    const items = picked.map((day) => {
      const v = hoursByDate[day];
      const hasHours = v !== undefined && String(v).trim() !== "";
      return { date: day, remark: remarks[day] || null, hours: hasHours ? Number(v) : undefined };
    });
    setMsg(null);
    const res = await fetch("/api/timesheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: Number(sectionId), items }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg({ type: "error", text: d.error }); return; }
    setMsg({ type: "ok", text: t("savedAll", { n: picked.length }) });
    setPicked([]); setRemarks({}); setHoursByDate({});
    invalidateTimesheet();
    load({ force: true });
  }

  async function removeEntry(id) {
    await fetch(`/api/timesheet?id=${id}`, { method: "DELETE" });
    invalidateTimesheet();
    load({ force: true });
  }

  function startEdit(e) {
    setEditId(e.id);
    setEditRemark(e.remark || "");
    setEditHours(e.hours != null ? String(e.hours) : "");
    setMsg(null);
  }
  function cancelEdit() {
    setEditId(null);
    setEditRemark("");
    setEditHours("");
  }
  async function saveEdit(e) {
    const s = sectionMap[e.section_id];
    const mod = s ? isModule(s) : false;
    const hasHours = String(editHours).trim() !== "";
    if (mod && !(Number(editHours) > 0)) {
      setMsg({ type: "error", text: t("needHours", { date: e.work_date }) });
      return;
    }
    if (hasHours && !(Number(editHours) > 0)) {
      setMsg({ type: "error", text: t("hoursPositive") });
      return;
    }
    const item = { date: e.work_date, remark: editRemark || null, hours: hasHours ? Number(editHours) : undefined };
    const res = await fetch("/api/timesheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: e.section_id, items: [item] }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg({ type: "error", text: d.error }); return; }
    setMsg({ type: "ok", text: t("savedOk", { date: e.work_date }) });
    cancelEdit();
    invalidateTimesheet();
    load({ force: true });
  }

  function shiftMonth(delta) {
    const dt = new Date(yy, mm - 1 + delta, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  const sectionMap = useMemo(() => {
    const m = {};
    (data?.sections || []).forEach((s) => (m[s.id] = s));
    return m;
  }, [data]);

  // entries shown in the right panel = this month, ONLY the section picked above
  const monthEntries = allEntries
    .filter((e) => e.work_date.slice(0, 7) === month)
    .filter((e) => String(e.section_id) === String(sectionId))
    .sort((a, b) => a.work_date.localeCompare(b.work_date));

  // monthly totals (hours + cost) for the selected section (entry-aware for module)
  const monthTotals = useMemo(() => {
    let hours = 0, cost = 0;
    monthEntries.forEach((e) => {
      const s = sectionMap[e.section_id];
      if (!s) return;
      hours += entryHours(s, e);
      cost += entryCost(s, e);
    });
    return { hours: Math.round(hours * 100) / 100, cost: Math.round(cost * 100) / 100 };
  }, [monthEntries, sectionMap]);


  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: controls + calendar */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card">
          <div className="mb-4">
            <label className="label">{t("courseSection")}</label>
            <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {(data?.sections || []).length === 0 && <option value="">{t("noAssigned")}</option>}
              {(data?.sections || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.course?.code} {s.course?.name} · {t("colSection")} {s.section} · {s.curriculum?.code} · {s.teaching_type || "—"}
                </option>
              ))}
            </select>
          </div>

          {/* Section info + budget bar */}
          {section && (
            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-600">
                <span className={`badge ${section.teaching_type === "LAB" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                  {section.teaching_type || "—"}
                </span>
                {moduleSec ? (
                  <>
                    <span className="badge bg-amber-100 text-amber-700">{t("moduleTag")}</span>
                    <span>{t("rate")} <b>{thb(rate)}</b> {t("bahtPerHr")}</span>
                  </>
                ) : (
                  <>
                    <span>{t("time")} <b>{section.start_time || "—"}–{section.end_time || "—"}</b></span>
                    <span>{t("hoursPerDay")} <b>{hPerDay}</b></span>
                    <span>{t("rate")} <b>{thb(rate)}</b> {t("bahtPerHr")}</span>
                    <span>{t("asMoney")} <b>{thb(perDayCost)}</b> {t("bahtPerDay")}</span>
                  </>
                )}
              </div>
              {budgetTotal != null ? (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{t("used")} {thb(usedCost)} {picked.length > 0 && <span className="text-brand">(+{thb(pickedCost)})</span>} / {t("budget")} {thb(budgetTotal)} {t("baht")}</span>
                    <span>{t("remaining")} {thb(remainingCost)} {t("baht")}{moduleSec && remainingHours != null ? ` (~${remainingHours} ${t("hrsShort")})` : ""}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full ${overBudget ? "bg-red-500" : "bg-brand"}`}
                      style={{ width: `${Math.min(100, (projectedUsed / budgetTotal) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">{t("noBudgetSet")}</div>
              )}
            </div>
          )}

          {/* Month switcher */}
          <div className="mb-3 flex items-center justify-between">
            <button className="btn-ghost" onClick={() => shiftMonth(-1)}>←</button>
            <div className="text-base font-semibold text-slate-700">{monthLabel(locale, yy, mm)}</div>
            <button className="btn-ghost" onClick={() => shiftMonth(1)}>→</button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {WD.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {weeks.flat().map((d, i) => {
              const st = dateState(d);
              if (st.kind === "empty") return <div key={i} />;
              const base = "relative aspect-square rounded-lg text-sm flex items-center justify-center select-none";
              let cls = "bg-slate-50 text-slate-700 hover:bg-brand-light cursor-pointer";
              let title = "";
              if (st.kind === "out") { cls = "bg-red-50 text-red-300 cursor-not-allowed line-through"; title = t("legendOut"); }
              else if (st.kind === "blackout") { cls = "bg-red-50 text-red-300 cursor-not-allowed line-through"; title = st.reason || t("legendBlackout"); }
              else if (st.kind === "logged") { cls = "bg-emerald-500 text-white cursor-pointer"; title = st.entry.remark || t("legendSaved"); }
              else if (st.kind === "selected") cls = "bg-brand text-white cursor-pointer ring-2 ring-brand-dark";
              return (
                <div key={i} className={`${base} ${cls}`} title={title}
                  onClick={() => st.kind === "logged" ? null : toggle(d)}>
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-brand inline-block" /> {t("legendSelected")}</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-emerald-500 inline-block" /> {t("legendSaved")}</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-red-100 inline-block" /> {t("legendBlackout")}</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-red-100 inline-block" /> {t("legendOut")}</span>
          </div>
        </div>

      </div>

      {/* Right: selected dates + remark, summary, entries */}
      <div className="space-y-4">
        {/* Selected dates + per-day remark */}
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-slate-700">{t("selectedDates")}</h3>
            <span className="text-sm text-slate-500">{picked.length} {t("days")}</span>
          </div>
          {picked.length > 0 && section && (
            <div className="mb-2 text-xs text-slate-500">
              {t("totalPrefix")} {pickedHours} {t("hrsShort")} · {thb(pickedCost)} {t("baht")}
            </div>
          )}

          {picked.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
              {t("pickHint")}
            </p>
          ) : (
            <ul className="space-y-2">
              {picked.slice().sort().map((s) => (
                <li key={s} className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{s}</span>
                    <button className="btn-danger" onClick={() => removePick(s)}>{t("delete")}</button>
                  </div>
                  {moduleSec && (
                    <div className="mb-1">
                      <label className="label">{t("hoursLabel")}</label>
                      <input
                        type="number" min="0" step="0.5"
                        className="input py-1"
                        placeholder={t("hoursPlaceholder")}
                        value={hoursByDate[s] ?? ""}
                        onChange={(e) => setHoursByDate({ ...hoursByDate, [s]: e.target.value })}
                      />
                    </div>
                  )}
                  {!isScholarship && (
                    <div className="mb-2">
                      <label className="label">{t("remarkLabel")}</label>
                      <input
                        className="input py-1"
                        placeholder={t("remarkPlaceholder")}
                        value={remarks[s] || ""}
                        onChange={(e) => setRemarks({ ...remarks, [s]: e.target.value })}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {picked.length > 0 && (
            <button className="btn-blue mt-3 w-full" disabled={overBudget} onClick={saveAll}>
              <SaveIcon size={16} /> {t("save")}
            </button>
          )}

          {msg && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {msg.text}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">{t("thisMonthList")}</h3>
            <span className="badge bg-brand-light text-brand">{monthEntries.length} {t("items")}</span>
          </div>
          {loading && <p className="text-sm text-slate-400">{t("loading")}</p>}
          {!loading && monthEntries.length === 0 && (
            <p className="text-sm text-slate-400">{t("noEntries")}</p>
          )}
          <ul className="space-y-2">
            {monthEntries.map((e) => {
              const s = sectionMap[e.section_id];
              const h = s ? entryHours(s, e) : 0;
              const c = s ? entryCost(s, e) : 0;
              const mod = s ? isModule(s) : false;
              if (editId === e.id) {
                return (
                  <li key={e.id} className="rounded-lg bg-white px-3 py-2 ring-1 ring-brand">
                    <div className="mb-2 text-sm font-medium text-slate-700">{e.work_date}</div>
                    {mod && (
                      <div className="mb-1">
                        <label className="label">{t("hoursLabel")}</label>
                        <input type="number" min="0" step="0.5" className="input py-1"
                          placeholder={t("hoursPlaceholder")}
                          value={editHours} onChange={(ev) => setEditHours(ev.target.value)} />
                      </div>
                    )}
                    {!isScholarship && (
                      <div className="mb-2">
                        <label className="label">{t("remarkLabel")}</label>
                        <input className="input py-1" placeholder={t("remarkPlaceholder")}
                          value={editRemark} onChange={(ev) => setEditRemark(ev.target.value)} />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button className="btn-blue flex-1 py-1 text-xs" title={t("save")} onClick={() => saveEdit(e)}><SaveIcon size={15} /> {t("save")}</button>
                      <button className="btn-ghost py-1 text-xs" onClick={cancelEdit}>{t("cancel")}</button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={e.id} className="flex items-start justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{e.work_date}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{h} {t("hrsShort")} · {thb(c)} {t("baht")}</div>
                    {e.remark && <div className="mt-0.5 text-xs text-slate-400">📝 {e.remark}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button className="btn-edit" onClick={() => startEdit(e)}>{t("edit")}</button>
                    <button className="btn-danger" onClick={() => removeEntry(e.id)}>{t("delete")}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
