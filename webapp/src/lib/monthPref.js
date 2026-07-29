// Remember the month the user is working on so the Overview and Log pages stay
// in sync when navigating between them (survives within the browser session).
const KEY = "ta_active_month";

export function getSavedMonth() {
  if (typeof window === "undefined") return null;
  try {
    const m = localStorage.getItem(KEY);
    return m && /^\d{4}-\d{2}$/.test(m) ? m : null;
  } catch {
    return null;
  }
}

export function setSavedMonth(m) {
  if (typeof window === "undefined" || !m) return;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}
