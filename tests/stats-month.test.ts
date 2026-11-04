import { describe, it, expect } from "vitest"
import { statsMonth, statsMonthStart } from "@/lib/stats-month"

/** "This month" rolls over at midnight in America/New_York, through daylight time and across years. */
describe("the month boundary", () => {
  it.each([
    ["standard time (UTC-5), Nov to Dec", "2026-12-01T04:59:59.999Z", "2026-11", "2026-12-01T05:00:00.000Z", "2026-12"],
    ["daylight time (UTC-4), Sep to Oct", "2026-10-01T03:59:59.999Z", "2026-09", "2026-10-01T04:00:00.000Z", "2026-10"],
    ["Oct to Nov 2026: clocks change that same night, midnight is still UTC-4", "2026-11-01T03:59:59.999Z", "2026-10", "2026-11-01T04:00:00.000Z", "2026-11"],
    ["Feb to Mar: standard time, before clocks change", "2027-03-01T04:59:59.999Z", "2027-02", "2027-03-01T05:00:00.000Z", "2027-03"],
    ["across a year", "2027-01-01T04:59:59.999Z", "2026-12", "2027-01-01T05:00:00.000Z", "2027-01"],
  ])("%s", (_label, before, monthBefore, after, monthAfter) => {
    expect(statsMonth(new Date(before))).toBe(monthBefore)
    expect(statsMonth(new Date(after))).toBe(monthAfter)
    expect(statsMonthStart(monthAfter).toISOString()).toBe(after)
  })

  it("isn't UTC: an instant already in December by UTC is still November", () => {
    expect(new Date("2026-12-01T02:00:00Z").toISOString().slice(0, 7)).toBe("2026-12")
    expect(statsMonth(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11")
  })

  it("every month's start falls in that month, and the instant before it doesn't", () => {
    for (let m = 1; m <= 12; m++) {
      const month = `2027-${String(m).padStart(2, "0")}`
      const start = statsMonthStart(month)
      expect(statsMonth(start)).toBe(month)
      expect(statsMonth(new Date(start.getTime() - 1))).not.toBe(month)
    }
  })
})
