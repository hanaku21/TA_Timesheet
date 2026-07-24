import Spinner from "@/components/Spinner";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Spinner />
      </main>
    </div>
  );
}
