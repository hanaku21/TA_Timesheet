// Resolve the active academic term (semester). Source of truth is the
// `terms` table row with is_active = true; falls back to settings.active_term.
export async function getActiveTerm(supabase) {
  const { data: active } = await supabase
    .from("terms")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (active) return active;

  // fallback: settings.active_term
  const { data: s } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "active_term")
    .maybeSingle();
  const code = s?.value || "2569/1";
  const { data: t } = await supabase
    .from("terms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return t || { code, name: code, start_date: null, end_date: null };
}
