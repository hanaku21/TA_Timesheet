import Link from "next/link";
import { getSession } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import TimesheetClient from "../TimesheetClient";
import { localeFromName, makeT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const session = await getSession();
  const t = makeT(localeFromName(session?.name));
  const initialSectionId = searchParams?.section || "";
  return (
    <div className="min-h-screen">
      <NavBar name={session?.name} role={session?.role} employmentType={session?.emp} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t("logTitle")}</h2>
          <Link href="/dashboard" className="btn-ghost text-sm">{t("backOverview")}</Link>
        </div>
        <TimesheetClient name={session?.name} employmentType={session?.emp} initialSectionId={initialSectionId} />
      </main>
    </div>
  );
}
