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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            CT
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              CAMT TA Timesheet
            </div>
            <div className="text-xs text-slate-400">
              {role === "admin" ? t("roleAdmin") : t("roleTA")}
            </div>
          </div>
        </div>
        {role !== "admin" && (
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <Link href="/dashboard" className={navCls(pathname === "/dashboard")}>{t("navOverview")}</Link>
            <Link href="/dashboard/log" className={navCls(pathname === "/dashboard/log")}>{t("navLog")}</Link>
          </nav>
        )}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-700">{name}</div>
            {employmentType && (
              <div className="text-xs text-slate-400">
                {empLabel || employmentType}
              </div>
            )}
          </div>
          <button onClick={logout} className="btn-ghost text-sm">
            {t("logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
