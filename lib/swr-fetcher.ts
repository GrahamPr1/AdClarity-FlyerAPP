/**
 * The shared SWR fetcher.
 *
 * WHY THIS EXISTS, rather than `(url) => fetch(url).then(r => r.json())`
 * inline in each component — which is what it replaces, in two files that had
 * drifted into separate identical copies.
 *
 * That one-liner never checks `res.ok`. Every API route here answers an error
 * with a JSON body (`{"error":"Unauthorized"}`, `{"error":"Not found"}`), so
 * `r.json()` SUCCEEDS on a 401 or 404 and SWR stores the error object as
 * `data`. The component then sees a truthy `data` and reads a field off it.
 *
 * That is not hypothetical. The admin dashboard renders a FlyerCard for every
 * client's flyers; seed flyers carry a trackingCode but have no tracking
 * record, so `/api/tracking/flyer/<id>` 404s. `statsData` became
 * `{error:"Not found"}`, `statsData.channels` was undefined, and
 * `statsData.channels.length` threw a TypeError that unmounted the whole
 * route — the browser's "This page couldn't load" page, on a clean 200 from
 * the server. Client dashboards were unaffected because a client only ever
 * sees their own flyers, which do have records.
 *
 * Throwing on a non-OK response is what SWR expects: `data` stays undefined,
 * `error` is populated, and the existing `isLoading || !data` guards render
 * their empty state instead of a component reading fields off an error body.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)

  if (!res.ok) {
    // The body is usually JSON with an `error` string, but a proxy or an
    // unhandled throw can return HTML — so parsing must never be load-bearing.
    let detail = ""
    try {
      const body = await res.json()
      if (body && typeof body.error === "string") detail = body.error
    } catch {
      // Non-JSON error body. The status code is enough.
    }
    throw new HttpError(res.status, detail || `Request failed with ${res.status}`)
  }

  return (await res.json()) as T
}
