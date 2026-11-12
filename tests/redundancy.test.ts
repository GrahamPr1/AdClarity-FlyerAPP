import { describe, it, expect } from "vitest"
import { findRedundantDevices, repairRedundancy } from "@/lib/agent-pipeline/redundancy"

const page = (body: string, title = "Taylor Welch Realty") => `<html><head><title>${title}</title></head><body>${body}</body></html>`

describe("findRedundantDevices", () => {
  it("flags the rule's own example: a medallion restating three blocks", () => {
    const html = page(
      `<div class="medallion"><span>PRIVACY.</span> <span>RECREATION.</span> <span>HOME.</span></div><h1>Find your place in the country</h1>` +
        `<div><p>Rural properties with privacy</p><p>Near the state park for recreation</p><p>Personal guidance to find your next home</p></div>`,
    )
    expect(findRedundantDevices(html).map((d) => d.device)).toEqual(["PRIVACY. RECREATION. HOME."])
  })

  it("judges the whole badge: a price with a label naming the service is the price's job, not a repeat", () => {
    // Every word of the medallion repeats the headline; its price appears nowhere else.
    const html = page(`<h1>Fall Furnace Tune-Up</h1><p>21-point safety check before the cold hits.</p><div class="medallion"><div>$89</div><div>Furnace Tune-Up</div></div>`, "Pearl Heating & Air")
    expect(findRedundantDevices(html)).toEqual([])
    // The same medallion with no figure of its own IS a repeat.
    expect(findRedundantDevices(html.replace("<div>$89</div>", "")).map((d) => d.device)).toEqual(["Furnace Tune-Up"])
  })

  it("ignores the business name repeated in header and footer", () => {
    expect(findRedundantDevices(page(`<header>Taylor Welch Realty</header><h1>Rural homes</h1><footer>Taylor Welch Realty</footer>`))).toEqual([])
  })
})

describe("repairRedundancy", () => {
  it("removes the later of two blocks carrying the same message", () => {
    const html = page(`<h1>Privacy. Recreation. Home.</h1><p class="sub">Rural homes near Barren River Lake State Park</p><div class="m">Personal guidance from a local agent</div><div class="near"><p>Rural properties</p><p>Near Barren River Lake State Park</p></div>`)
    const r = repairRedundancy(html)
    expect(r.removed).toEqual(["Rural propertiesNear Barren River Lake State Park"])
    expect(r.html).toContain("Rural homes near Barren River Lake State Park")
  })

  it("never removes a headline, a call to action, a phone number or disclaimer wording", () => {
    const html = page(
      `<h1>Furnace tune-up special</h1><p>Furnace tune-up special</p>` +
        `<a href="tel:5025550142">Book furnace tune-up</a><p>Book furnace tune-up 502-555-0142</p>` +
        `<p>Tune-up offer valid thru Nov</p><p>Tune-up offer valid thru Nov</p>`,
    )
    const r = repairRedundancy(html)
    expect(r.html).toContain("<h1>Furnace tune-up special</h1>")
    expect(r.html).toContain(">Book furnace tune-up</a>")
    expect(r.html).toContain("502-555-0142")
    expect(r.html.match(/valid thru Nov/g)).toHaveLength(2)
  })

  it("never removes prose or anything in a header or footer — a proposal's acceptance clause survived only after this", () => {
    const html = page(
      `<header><p>Proposal: roof replacement scope and pricing</p></header>` +
        `<section><p>Scope of work and pricing for the roof replacement.</p></section>` +
        `<footer><p>By signing below, the homeowner accepts the scope of work and pricing described above.</p></footer>`,
    )
    const r = repairRedundancy(html)
    expect(r.removed).toEqual([])
    expect(r.html).toContain("By signing below")
    expect(r.html).toContain("Proposal: roof replacement scope and pricing")
  })
})
