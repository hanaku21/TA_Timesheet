import { getSession } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  return (
    <div className="min-h-screen">
      <NavBar name={session?.name} role={session?.role} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AdminClient />
      </main>
    </div>
  );
}
