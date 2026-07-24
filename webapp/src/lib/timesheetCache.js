// Tiny in-memory cache for GET /api/timesheet so navigating between the
// Overview and Log pages (which need the same data) doesn't refetch every time.
// Cache lives for the page session; any write invalidates it.

let cache = null; // { at: number, promise: Promise<data> }
const TTL = 20000; // 20s

export function fetchTimesheet({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.promise;
  const promise = fetch("/api/timesheet")
    .then((r) => r.json())
    .catch((e) => {
      cache = null; // don't cache failures
      throw e;
    });
  cache = { at: Date.now(), promise };
  return promise;
}

export function invalidateTimesheet() {
  cache = null;
}
