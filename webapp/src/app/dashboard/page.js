import { getSession } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import OverviewClient from "./OverviewClient";
import AnnouncementModal from "@/components/AnnouncementModal";
import { localeFromName } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  return (
    <div className="min-h-screen">
      <NavBar name={session?.name} role={session?.role} employmentType={session?.emp} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <OverviewClient employmentType={session?.emp} name={session?.name} />
      </main>
      <AnnouncementModal locale={localeFromName(session?.name)} />
    </div>
  );
}
