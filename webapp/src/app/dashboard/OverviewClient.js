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

      {/* Whole-term budget summary */}
      {!loading && sections.length > 0 && (
        <div className="card">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-700">{t("budgetTitle")}</h3>
              <p className="text-xs text-slate-500">{t("budgetSub")}</p>
            </div>
            <div className="text-sm text-slate-600">
              {t("budgetTotal")}: {t("budgetUsed")} <b className="text-brand">{thb(budgetTotal.used)}</b> / {t("budgetFull")} <b>{thb(budgetTotal.budget)}</b> {t("baht")}
              {" · "}{t("budgetLeft")} <b className={budgetTotal.remaining < 0 ? "text-red-600" : "text-emerald-700"}>{thb(budgetTotal.remaining)}</b> {t("baht")}
            </div>
          </div>
          {/* จ้างเหมา: ใบวางบิล / ใบเสร็จรับเงิน per เลข TOR */}
          {isTOR && (() => {
            const tors = [...new Set(sections.map((s) => s.tor_number).filter(Boolean))];
            if (tors.length === 0) return null;
            return (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2">
                <div className="text-sm font-semibold text-amber-800">{t("torDocsTitle")}</div>
                <div className="mb-2 text-xs text-amber-700/80">{t("torDocsSub")}</div>
                <ul className="space-y-1.5">
                  {tors.map((tor) => {
                    const secs = sections.filter((s) => s.tor_number === tor);
                    const codes = [...new Set(secs.map((s) => s.course?.code).filter(Boolean))].join(", ");
                    return (
                      <li key={tor} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-amber-100">
                        <div className="text-sm">
                          <span className="font-semibold text-slate-700">{t("colTor")} {tor}</span>
                          <span className="ml-2 text-xs text-slate-500">{codes}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-500">{t("torBill")}:</span>
                          <a className="btn-edit" href={`/api/timesheet/tor-doc?kind=bill&format=xlsx&tor=${encodeURIComponent(tor)}`}>⬇ .xlsx</a>
                          <a className="btn-soft" href={`/api/timesheet/tor-doc?kind=bill&format=pdf&tor=${encodeURIComponent(tor)}`}>⬇ .pdf</a>
                          <span className="ml-2 text-xs text-slate-500">{t("torReceipt")}:</span>
                          <a className="btn-edit" href={`/api/timesheet/tor-doc?kind=receipt&format=xlsx&tor=${encodeURIComponent(tor)}`}>⬇ .xlsx</a>
                          <a className="btn-soft" href={`/api/timesheet/tor-doc?kind=receipt&format=pdf&tor=${encodeURIComponent(tor)}`}>⬇ .pdf</a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {budgets.map(({ s, budget, used, thisMonth, remaining, moreDays, moreHours }) => {
              const over = remaining != null && remaining < -1e-6;
              const low = !over && budget > 0 && remaining / budget < 0.1;
              const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
              return (
                <div key={s.id} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-700" title={s.course?.name}>
                        {s.course?.code} <span className="font-normal text-slate-500">{s.course?.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {t("colSection")} {s.section} · {s.curriculum?.code} · {s.teaching_type || "—"}
                      </div>
                    </div>
                    {over && <span className="badge shrink-0 bg-red-100 text-red-700">{t("budgetOver")}</span>}
                  </div>
                  {budget == null ? (
                    <div className="mt-2 text-xs text-slate-400">{t("budgetNone")} · {t("budgetUsed")} {thb(used)} {t("baht")}</div>
                  ) : (
                    <>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                        <span>{t("budgetFull")} <b className="text-slate-800">{thb(budget)}</b></span>
                        <span>{t("budgetUsed")} <b className="text-brand">{thb(used)}</b></span>
                        <span>{t("budgetThisMonth")} <b className="text-emerald-700">{thb(thisMonth)}</b></span>
                        <span>{t("budgetLeft")} <b className={over ? "text-red-600" : low ? "text-amber-600" : "text-slate-800"}>{thb(remaining)}</b></span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className={`h-full ${over ? "bg-red-500" : low ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-right text-[11px] text-slate-500">{Math.round((used / budget) * 100)}%</span>
                      </div>
                      {!over && (moreDays != null || moreHours != null) && (
                        <div className="mt-1 text-[11px] text-slate-400">
                          {moreDays != null ? t("budgetDaysLeft", { n: moreDays }) : t("budgetHoursLeft", { n: moreHours })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
