"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { entryHours, entryCost, thb, costPerDay, isModule, toRate } from "@/lib/calc";
import { EditIcon } from "@/components/Icons";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import { fetchTimesheet, invalidateTimesheet } from "@/lib/timesheetCache";
import { getSavedMonth, setSavedMonth } from "@/lib/monthPref";
import { localeFromName, makeT, monthLabel } from "@/lib/i18n";

export default function OverviewClient({ employmentType, name }) {
  const isTOR = employmentType === "TOR";
  const locale = localeFromName(name);
  const t = makeT(locale);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmSection, setConfirmSection] = useState(null); // { id, label } or null
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    invalidateTimesheet();
    const d = await fetchTimesheet({ force: true });
    setData(d);
  };

  async function confirmSubmit() {
    if (!confirmSection) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/timesheet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, section_id: confirmSection.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "ไม่สำเร็จ");
      setConfirmSection(null);
      await reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const d = await fetchTimesheet();
      if (alive) { setData(d); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // show the month the user was last working on (from the Log page), then keep it in sync
  useEffect(() => { const m = getSavedMonth(); if (m) setMonth(m); }, []);
  useEffect(() => { setSavedMonth(month); }, [month]);

  const [yy, mm] = month.split("-").map(Number);
  const entries = data?.entries || [];
  const sections = data?.sections || [];

  // per-section totals for the selected month
  const rows = useMemo(() => {
    return sections
      .map((s) => {
        const es = entries.filter(
          (e) => String(e.section_id) === String(s.id) && e.work_date.slice(0, 7) === month
        );
        const days = es.length;
        const hours = Math.round(es.reduce((a, e) => a + entryHours(s, e), 0) * 100) / 100;
        const cost = Math.round(es.reduce((a, e) => a + entryCost(s, e), 0) * 100) / 100;
        return { s, days, hours, cost };
      })
      .sort((a, b) => (a.s.course?.code || "").localeCompare(b.s.course?.code || ""));
  }, [sections, entries, month]);

  // ---- whole-term budget per section (expected_cost vs. everything logged) ----
  const budgets = useMemo(() => {
    const list = sections.map((s) => {
      const all = entries.filter((e) => String(e.section_id) === String(s.id));
      const used = Math.round(all.reduce((a, e) => a + entryCost(s, e), 0) * 100) / 100;
      const thisMonth = Math.round(
        all.filter((e) => e.work_date.slice(0, 7) === month).reduce((a, e) => a + entryCost(s, e), 0) * 100
      ) / 100;
      const budget = s.expected_cost == null ? null : Number(s.expected_cost);
      const remaining = budget == null ? null : Math.round((budget - used) * 100) / 100;
      const perDay = costPerDay(s);
      const rate = toRate(s.rate);
      const mod = isModule(s);
      const moreDays = !mod && remaining != null && perDay > 0 ? Math.max(0, Math.floor((remaining + 1e-6) / perDay)) : null;
      const moreHours = mod && remaining != null && rate > 0 ? Math.max(0, Math.floor((remaining / rate) * 100) / 100) : null;
      return { s, budget, used, thisMonth, remaining, moreDays, moreHours, days: all.length };
    });
    return list.sort((a, b) => (a.s.course?.code || "").localeCompare(b.s.course?.code || ""));
  }, [sections, entries, month]);
  const budgetTotal = useMemo(() => {
    const t = { budget: 0, used: 0, thisMonth: 0, remaining: 0, noBudget: 0 };
    budgets.forEach((b) => {
      t.used += b.used;
      t.thisMonth += b.thisMonth;
      if (b.budget == null) t.noBudget += 1;
      else { t.budget += b.budget; t.remaining += b.remaining; }
    });
    return t;
  }, [budgets]);

  const withData = rows.filter((r) => r.days > 0);
  const totalCost = Math.round(withData.reduce((a, r) => a + r.cost, 0) * 100) / 100;

  // per-section confirmation (frozen) for the selected month -> gates downloads
  const subs = data?.submissions || [];
  const isConfirmed = (sectionId) =>
    subs.some((s) => s.month === month && String(s.section_id) === String(sectionId));
  const allConfirmed = withData.length > 0 && withData.every((r) => isConfirmed(r.s.id));

  // DII runs on its own academic calendar, so its sections are exempt from the
  // term open/close month lock — a DII TA can log any month.
  const isDii = sections.some((s) => (s.curriculum?.code || "").toUpperCase() === "DII");

  // TOR sections may run past the term dates, so widen the switcher to cover
  // any section's contract window too.
  const torBounds = sections.reduce(
    (acc, s) => {
      if (s.tor_start && (!acc.min || s.tor_start < acc.min)) acc.min = s.tor_start;
      if (s.tor_end && (!acc.max || s.tor_end > acc.max)) acc.max = s.tor_end;
      return acc;
    },
    { min: null, max: null }
  );
  const termMin = data?.semester?.start ? data.semester.start.slice(0, 7) : null;
  const termMax = data?.semester?.end ? data.semester.end.slice(0, 7) : null;
  const torMin = torBounds.min ? torBounds.min.slice(0, 7) : null;
  const torMax = torBounds.max ? torBounds.max.slice(0, 7) : null;

  // Limit the month switcher to the active term (เปิดเทอม → ปิดเทอม), unless DII;
  // union with the TOR windows so those months stay reachable.
  const minMonth = isDii ? null : [termMin, torMin].filter(Boolean).sort()[0] || null;
  const maxMonth = isDii ? null : [termMax, torMax].filter(Boolean).sort().slice(-1)[0] || null;

  // Clamp the selected month into the term once the term is known.
  useEffect(() => {
    if (!minMonth && !maxMonth) return;
    setMonth((m) => {
      if (minMonth && m < minMonth) return minMonth;
      if (maxMonth && m > maxMonth) return maxMonth;
      return m;
    });
  }, [minMonth, maxMonth]);

  const canPrev = !minMonth || month > minMonth;
  const canNext = !maxMonth || month < maxMonth;

  function shiftMonth(delta) {
    const dt = new Date(yy, mm - 1 + delta, 1);
    const next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (minMonth && next < minMonth) return;
    if (maxMonth && next > maxMonth) return;
    setMonth(next);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t("myClaims")}</h2>
          <p className="text-sm text-slate-500">{t("overviewSub")}</p>
        </div>
        <button
          type="button"
          className="btn bg-red-50 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-100"
          title={t("announceBtnHint")}
          onClick={() => window.dispatchEvent(new Event("ta:open-announcements"))}
        >
          📢 {t("announceBtn")}
        </button>
      </div>

      {/* Whole-term budget summary — table layout */}
      {!loading && sections.length > 0 && (() => {
        const pctAll = budgetTotal.budget > 0 ? Math.min(100, (budgetTotal.used / budgetTotal.budget) * 100) : 0;
        const overAll = budgetTotal.remaining < -1e-6;
        const docUrl = (kind, fmt, tor) => `/api/timesheet/tor-doc?kind=${kind}&format=${fmt}&tor=${encodeURIComponent(tor)}`;
        // TOR users: group rows by เลข TOR so the TOR / document cells span the group's rows
        const ordered = isTOR
          ? [...budgets].sort((a, b) => String(a.s.tor_number || "").localeCompare(String(b.s.tor_number || ""), undefined, { numeric: true }) || (a.s.course?.code || "").localeCompare(b.s.course?.code || ""))
          : budgets;
        const groupSize = {}; // index of first row in group -> rows in that group
        const firstIdxOfTor = {};
        ordered.forEach((b, idx) => {
          const key = b.s.tor_number || `__none_${idx}`;
          if (firstIdxOfTor[key] == null) { firstIdxOfTor[key] = idx; groupSize[idx] = 0; }
          groupSize[firstIdxOfTor[key]] += 1;
        });
        return (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            {/* header band */}
            <div className="bg-gradient-to-r from-brand to-violet-500 px-5 py-4 text-white">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-white/70">{t("budgetTotal")}</div>
                  <h3 className="text-lg font-bold">{t("budgetTitle")}</h3>
                  <p className="text-xs text-white/80">{t("budgetSub")}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right">
                  <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                    <div className="text-[11px] text-white/70">{t("budgetFull")}</div>
                    <div className="text-base font-bold tabular-nums">{thb(budgetTotal.budget)}</div>
                  </div>
                  <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                    <div className="text-[11px] text-white/70">{t("budgetUsed")}</div>
                    <div className="text-base font-bold tabular-nums">{thb(budgetTotal.used)}</div>
                  </div>
                  <div className={`rounded-xl px-3 py-2 backdrop-blur ${overAll ? "bg-red-500/70" : "bg-white/15"}`}>
                    <div className="text-[11px] text-white/70">{t("budgetLeft")}</div>
                    <div className="text-base font-bold tabular-nums">{thb(budgetTotal.remaining)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
                  <div className={`h-full rounded-full ${overAll ? "bg-red-300" : "bg-white"}`} style={{ width: `${pctAll}%` }} />
                </div>
                <span className="w-12 text-right text-xs font-semibold tabular-nums">{Math.round(pctAll)}%</span>
              </div>
            </div>

            {/* table — one row per course/section; for จ้างเหมา the เลข TOR and document
                cells span all rows of the same TOR (centred between the courses) */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">{t("colCourse")} / {t("colSection")}</th>
                    {isTOR && <th className="px-3 py-2.5 text-center">{t("colTor")}</th>}
                    <th className="px-3 py-2.5 text-right">{t("budgetFull")}</th>
                    <th className="px-3 py-2.5 text-right">{t("budgetUsed")}</th>
                    <th className="px-3 py-2.5 text-right">{t("budgetThisMonth")}</th>
                    <th className="px-3 py-2.5 text-right">{t("budgetLeft")}</th>
                    <th className="px-3 py-2.5 w-36">{t("budgetProgress")}</th>
                    {isTOR && <th className="px-3 py-2.5 text-center">{t("torBill")}</th>}
                    {isTOR && <th className="px-3 py-2.5 text-center">{t("torReceipt")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(({ s, budget, used, thisMonth, remaining, moreDays, moreHours }, idx) => {
                    const over = remaining != null && remaining < -1e-6;
                    const low = !over && budget > 0 && remaining / budget < 0.1;
                    const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
                    const tor = s.tor_number;
                    const span = groupSize[idx];           // set only on the first row of a TOR group
                    const groupStart = span != null;
                    const k = tor || `__none_${idx}`;
                    const groupEnd = idx === firstIdxOfTor[k] + groupSize[firstIdxOfTor[k]] - 1;
                    const docCell = (kind) => (
                      <td rowSpan={span} className="border-l border-slate-100 px-3 py-3 text-center align-middle whitespace-nowrap">
                        {tor ? (
                          <div className="inline-flex gap-1">
                            <a className="btn-edit" href={docUrl(kind, "xlsx", tor)}>⬇ .xlsx</a>
                            <a className="btn-soft" href={docUrl(kind, "pdf", tor)}>⬇ .pdf</a>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    );
                    return (
                      <tr key={s.id} className={`transition hover:bg-slate-50/70 ${isTOR && groupEnd ? "border-b border-slate-200" : "border-b border-slate-50"}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">
                            {s.course?.code} <span className="font-normal text-slate-500">{s.course?.name}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{t("colSection")} {s.section}</span>
                            <span>{s.curriculum?.code}</span>
                            <span>· {s.teaching_type || "—"}</span>
                            {over && <span className="badge bg-red-100 text-red-700">{t("budgetOver")}</span>}
                            {!over && (moreDays != null || moreHours != null) && (
                              <span className="text-slate-400">· {moreDays != null ? t("budgetDaysLeft", { n: moreDays }) : t("budgetHoursLeft", { n: moreHours })}</span>
                            )}
                          </div>
                        </td>
                        {isTOR && groupStart && (
                          <td rowSpan={span} className="border-l border-r border-slate-100 bg-amber-50/50 px-3 py-3 text-center align-middle font-semibold text-amber-800 whitespace-nowrap">
                            {tor || "—"}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{budget == null ? <span className="text-slate-400">—</span> : thb(budget)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-brand">{thb(used)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{thisMonth ? thb(thisMonth) : <span className="text-slate-300">0</span>}</td>
                        <td className={`px-3 py-3 text-right tabular-nums font-bold ${over ? "text-red-600" : low ? "text-amber-600" : "text-slate-800"}`}>
                          {remaining == null ? <span className="font-normal text-slate-400">—</span> : thb(remaining)}
                        </td>
                        <td className="px-3 py-3">
                          {budget > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                <div className={`h-full rounded-full ${over ? "bg-red-500" : low ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-9 text-right text-[11px] tabular-nums text-slate-500">{Math.round((used / budget) * 100)}%</span>
                            </div>
                          ) : <span className="text-xs text-slate-400">{t("budgetNone")}</span>}
                        </td>
                        {isTOR && groupStart && docCell("bill")}
                        {isTOR && groupStart && docCell("receipt")}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-700">
                    <td className="px-4 py-2.5" colSpan={isTOR ? 2 : 1}>
                      {t("budgetTotal")} · {budgets.length} {t("colSection").toLowerCase()}{budgetTotal.noBudget > 0 ? ` · ${t("budgetNone")} ${budgetTotal.noBudget}` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{thb(budgetTotal.budget)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-brand">{thb(budgetTotal.used)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{thb(budgetTotal.thisMonth)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${overAll ? "text-red-600" : "text-slate-800"}`}>{thb(budgetTotal.remaining)}</td>
                    <td className="px-3 py-2.5" colSpan={isTOR ? 3 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {isTOR && (
              <div className="border-t border-slate-100 bg-amber-50/60 px-4 py-2 text-[11px] text-amber-800">
                {t("torDocsSub")}
              </div>
            )}
          </div>
        );
      })()}

      {/* Section heading: monthly time logging */}
      <div className="pt-2">
        <h3 className="text-base font-bold text-slate-800">{t("logSectionTitle")}</h3>
        <p className="text-xs text-slate-500">{t("logSectionSub")}</p>
      </div>

      {/* Month switcher + total */}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" disabled={!canPrev} onClick={() => shiftMonth(-1)}>←</button>
          <div className="min-w-[150px] text-center font-semibold text-slate-700">{monthLabel(locale, yy, mm)}</div>
          <button className="btn-ghost" disabled={!canNext} onClick={() => shiftMonth(1)}>→</button>
        </div>
        <div className="text-sm text-slate-600">
          {t("monthTotal")} <b className="text-emerald-600">{thb(totalCost)}</b> {t("baht")} · {withData.length} {t("items")}
        </div>
        {allConfirmed && (
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn-ghost text-sm" href={`/api/timesheet/export?month=${month}`}>⬇ {t("all")} .xlsx</a>
            <a className="btn-ghost text-sm" href={`/api/timesheet/export-pdf?month=${month}`}>⬇ {t("all")} .pdf</a>
          </div>
        )}
      </div>

      {/* List */}
      <div className="card overflow-x-auto">
        {loading ? (
          <Spinner label={t("loading")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-light text-left text-xs font-bold text-slate-700">
                <th className="px-3 py-2">{t("colCourse")}</th>
                <th className="px-3 py-2">{t("colSection")}</th>
                <th className="px-3 py-2">{t("colType")}</th>
                {isTOR && <th className="px-3 py-2">{t("colTor")}</th>}
                <th className="px-3 py-2 text-right">{t("colDays")}</th>
                <th className="px-3 py-2 text-right">{t("colHours")}</th>
                <th className="px-3 py-2 text-right">{t("colAmount")}</th>
                <th className="px-3 py-2 text-right">{t("colLog")}</th>
                <th className="px-3 py-2 text-right">{t("colDownload")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, days, hours, cost }) => (
                <tr key={s.id} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-700">{s.course?.code}</span>{" "}
                    <span className="text-slate-500">{s.course?.name}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.section}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`badge ${s.teaching_type === "LAB" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                      {s.teaching_type || "—"}
                    </span>
                  </td>
                  {isTOR && <td className="px-3 py-2 whitespace-nowrap text-slate-600">{s.tor_number || "—"}</td>}
                  <td className="px-3 py-2 text-right">{days}</td>
                  <td className="px-3 py-2 text-right">{hours}</td>
                  <td className="px-3 py-2 text-right font-medium text-emerald-700">{thb(cost)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link className="btn-sky" title={t("logEntry")} href={`/dashboard/log?section=${s.id}&month=${month}`}><EditIcon size={15} /></Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {days === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : isConfirmed(s.id) ? (
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <a className="btn-edit" href={`/api/timesheet/export?month=${month}&section_id=${s.id}`}>⬇ .xlsx</a>
                        <a className="btn-soft" href={`/api/timesheet/export-pdf?month=${month}&section_id=${s.id}`}>⬇ .pdf</a>
                      </div>
                    ) : (
                      <button
                        className="btn-xs whitespace-nowrap bg-brand text-white hover:bg-brand-dark"
                        onClick={() => setConfirmSection({ id: s.id, label: `${s.course?.code || ""} ${t("colSection")} ${s.section}` })}
                      >
                        {t("confirmSubmit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={isTOR ? 9 : 8} className="px-3 py-6 text-center text-sm text-slate-400">{t("noCourses")}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!confirmSection} onClose={() => setConfirmSection(null)} title={t("confirmTitle")}>
        {confirmSection && (
          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            {confirmSection.label}
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate-600">{t("confirmMsg")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmSection(null)}>{t("cancel")}</button>
          <button className="btn-primary" disabled={submitting} onClick={confirmSubmit}>
            {submitting ? "..." : t("confirmYes")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
