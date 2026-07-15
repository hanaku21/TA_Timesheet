"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { entryHours, entryCost, thb } from "@/lib/calc";
import { SaveIcon } from "@/components/Icons";
import { localeFromName, makeT, monthLabel } from "@/lib/i18n";

export default function OverviewClient({ employmentType, name }) {
  const isTOR = employmentType === "TOR";
  const locale = localeFromName(name);
  const t = makeT(locale);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/timesheet");
      setData(await res.json());
      setLoading(false);
    })();
  }, []);

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

  const withData = rows.filter((r) => r.days > 0);
  const totalCost = Math.round(withData.reduce((a, r) => a + r.cost, 0) * 100) / 100;

  // Limit the month switcher to the active term (เปิดเทอม → ปิดเทอม).
  const minMonth = data?.semester?.start ? data.semester.start.slice(0, 7) : null;
  const maxMonth = data?.semester?.end ? data.semester.end.slice(0, 7) : null;

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
        {withData.length > 0 && (
          <a className="btn-ghost text-sm" href={`/api/timesheet/export-split?month=${month}`}>{t("downloadAllZip")}</a>
        )}
      </div>

      {/* List */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">{t("loading")}</p>
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
                <tr key={s.id} className={`odd:bg-white even:bg-slate-50 ${days === 0 ? "opacity-50" : ""}`}>
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
                    <Link className="btn-sky" title={t("logEntry")} href={`/dashboard/log?section=${s.id}`}><SaveIcon size={15} /></Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {days > 0 ? (
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <a className="btn-edit" href={`/api/timesheet/export?month=${month}&section_id=${s.id}`}>⬇ .xlsx</a>
                        <a className="btn-soft" href={`/api/timesheet/export-pdf?month=${month}&section_id=${s.id}`}>⬇ .pdf</a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
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
    </div>
  );
}
