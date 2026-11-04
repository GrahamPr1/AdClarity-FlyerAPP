// "This month" on a flyer's results line means a calendar month in
// America/New_York, for scans, clicks and leads alike. A counter's key holds
// the month it was written in and can't be re-bucketed later, so this has to
// stay fixed once counters are live.

const TIME_ZONE = "America/New_York"

const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" })

/** The month an instant falls in, in Eastern time: "2026-11". */
export function statsMonth(at: Date = new Date()): string {
  const parts = formatter.formatToParts(at)
  const part = (type: "year" | "month") => parts.find((p) => p.type === type)!.value
  return `${part("year")}-${part("month")}`
}

/**
 * The instant a month starts: midnight on the 1st, Eastern. That's UTC-4 or
 * UTC-5 depending on daylight time, and the wrong guess lands on the evening
 * before, in the previous month.
 */
export function statsMonthStart(month: string): Date {
  const daylight = new Date(`${month}-01T00:00:00-04:00`)
  return statsMonth(daylight) === month ? daylight : new Date(`${month}-01T00:00:00-05:00`)
}
