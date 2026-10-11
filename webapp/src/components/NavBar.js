"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { EMP_LABELS } from "@/lib/constants";
import { localeFromName, makeT } from "@/lib/i18n";

const EMP_LABELS_EN = { TOR: "TOR (contract)", SCHOLARSHIP: "Scholarship", TA_RA: "TA / RA" };

export default function NavBar({ name, role, employmentType }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromName(name);
  const t = makeT(locale);
  const empLabel = locale === "en" ? EMP_LABELS_EN[employmentType] : EMP_LABELS[employmentType];
  const navCls = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-brand text-white shadow-sm"
        : "text-slate-600 hover:bg-brand-light hover:text-brand"
    }`;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              CT
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">CAMT TA Timesheet</div>
              <div className="hidden text-xs text-slate-400 sm:block">
                {role === "admin" ? t("roleAdmin") : t("roleTA")}
              </div>
            </div>
          </div>

          {/* desktop tabs */}
          {role !== "admin" && (
            <nav className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex">
              <Link href="/dashboard" className={navCls(pathname === "/dashboard")}>{t("navOverview")}</Link>
              <Link href="/dashboard/log" className={navCls(pathname === "/dashboard/log")}>{t("navLog")}</Link>
            </nav>
          )}

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0 text-right">
              <div className="max-w-[140px] truncate text-sm font-medium text-slate-700 sm:max-w-none">{name}</div>
              {employmentType && (
                <div className="hidden text-xs text-slate-400 sm:block">
                  {empLabel || employmentType}
                </div>
              )}
            </div>
            <button onClick={logout} className="btn-ghost shrink-0 px-3 text-sm" title={t("logout")}>
              <span className="hidden sm:inline">{t("logout")}</span>
              <span className="sm:hidden" aria-hidden="true">⎋</span>
            </button>
          </div>
        </div>

        {/* mobile tabs (full-width, second row) */}
        {role !== "admin" && (
          <nav className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 md:hidden">
            <Link href="/dashboard" className={`${navCls(pathname === "/dashboard")} text-center`}>{t("navOverview")}</Link>
            <Link href="/dashboard/log" className={`${navCls(pathname === "/dashboard/log")} text-center`}>{t("navLog")}</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
