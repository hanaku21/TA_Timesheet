// Supabase/PostgREST returns at most 1,000 rows per request (max_rows). Any query
// that can grow past that (e.g. every timesheet entry of a term) must be paged,
// otherwise rows silently go missing. `build()` must return a fresh query each
// call; we add a stable order + range so pages don't overlap.
export async function selectAll(build, { pageSize = 1000, orderBy = "id" } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build().order(orderBy, { ascending: true }).range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: out, error: null };
}
