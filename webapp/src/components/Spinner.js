// Simple centered loading spinner.
export default function Spinner({ label = "กำลังโหลด..." }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
