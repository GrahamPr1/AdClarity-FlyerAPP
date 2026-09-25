import { describe, expect, it } from "vitest"
import { applyFieldEdits, readEditableFields, supportsDirectEdit } from "@/lib/agent-pipeline/flyer-edit"

const marked = (headline = "Spring roof inspection", phone = "(270) 555-0142") =>
  `<!doctype html><html><head><title>Acme</title></head><body>
     <h1><span data-field="headline" data-max="52">${headline}</span></h1>
     <p><span data-field="supporting" data-max="110">Written report included.</span></p>
     <footer>
       <span data-field="phone" data-max="40">${phone}</span>
       <span data-field="address" data-max="120">Bowling Green, KY</span>
     </footer>
   </body></html>`

/** What a flyer generated before markers existed looks like. */
const unmarked = `<!doctype html><html><body><h1>Spring roof inspection</h1></body></html>`

describe("supportsDirectEdit", () => {
  it("detects a marked flyer", () => expect(supportsDirectEdit(marked())).toBe(true))
  it("detects a pre-marker flyer", () => expect(supportsDirectEdit(unmarked)).toBe(false))
})

describe("readEditableFields", () => {
  it("returns each field with its current value and budget", () => {
    const fields = readEditableFields(marked())
    expect(fields.map((f) => f.field)).toEqual(["headline", "supporting", "phone", "address"])
    expect(fields[0]).toMatchObject({ value: "Spring roof inspection", max: 52 })
  })

  it("returns nothing for a pre-marker flyer", () => {
    expect(readEditableFields(unmarked)).toEqual([])
  })

  it("falls back to a generous budget when data-max is missing", () => {
    const html = `<span data-field="headline">Hi</span>`
    expect(readEditableFields(html)[0].max).toBe(200)
  })
})

describe("applyFieldEdits", () => {
  it("applies a valid edit", () => {
    const r = applyFieldEdits(marked(), { headline: "$99 roof inspection" })
    expect(r.applied).toEqual(["headline"])
    expect(r.rejected).toEqual([])
    expect(readEditableFields(r.html)[0].value).toBe("$99 roof inspection")
  })

  it("REJECTS text longer than the layout can fit", () => {
    // The whole point: a 300-char headline in a box measured for 52 does not
    // wrap, it overflows and ruins the print.
    const r = applyFieldEdits(marked(), { headline: "x".repeat(300) })
    expect(r.applied).toEqual([])
    expect(r.rejected[0]).toMatchObject({ field: "headline", reason: "too_long", max: 52, actual: 300 })
    // and the document is unchanged
    expect(readEditableFields(r.html)[0].value).toBe("Spring roof inspection")
  })

  it("accepts a value exactly at the budget", () => {
    const r = applyFieldEdits(marked(), { headline: "x".repeat(52) })
    expect(r.applied).toEqual(["headline"])
  })

  it("applies the valid fields of a mixed submission and reports the rest", () => {
    const r = applyFieldEdits(marked(), { phone: "(270) 555-9999", headline: "y".repeat(80) })
    expect(r.applied).toEqual(["phone"])
    expect(r.rejected.map((x) => x.field)).toEqual(["headline"])
    const fields = readEditableFields(r.html)
    expect(fields.find((f) => f.field === "phone")!.value).toBe("(270) 555-9999")
    expect(fields.find((f) => f.field === "headline")!.value).toBe("Spring roof inspection")
  })

  it("refuses to empty a field that would leave a hole", () => {
    const r = applyFieldEdits(marked(), { headline: "   " })
    expect(r.rejected[0]).toMatchObject({ field: "headline", reason: "empty" })
  })

  it("allows address to be cleared, since a flyer without one is normal", () => {
    const r = applyFieldEdits(marked(), { address: "" })
    expect(r.applied).toEqual(["address"])
    expect(readEditableFields(r.html).find((f) => f.field === "address")!.value).toBe("")
  })

  it("reports an unknown field rather than silently doing nothing", () => {
    const r = applyFieldEdits(marked(), { nonsense: "x" })
    expect(r.rejected[0]).toMatchObject({ field: "nonsense", reason: "unknown_field" })
  })

  it("escapes markup instead of injecting it", () => {
    const r = applyFieldEdits(marked(), { headline: "<script>alert(1)</script>" })
    expect(r.applied).toEqual(["headline"])
    expect(r.html).not.toContain("<script>alert(1)</script>")
    expect(readEditableFields(r.html)[0].value).toBe("<script>alert(1)</script>")
  })

  it("updates every element carrying the same field", () => {
    const html = `<span data-field="phone" data-max="40">old</span><span data-field="phone" data-max="40">old</span>`
    const r = applyFieldEdits(html, { phone: "new" })
    expect(r.html.match(/new/g)).toHaveLength(2)
  })

  it("collapses whitespace so a pasted value can't secretly exceed its budget", () => {
    const r = applyFieldEdits(marked(), { headline: "  Roof   inspection  " })
    expect(readEditableFields(r.html)[0].value).toBe("Roof inspection")
  })

  it("changes nothing on a pre-marker flyer", () => {
    const r = applyFieldEdits(unmarked, { headline: "new" })
    expect(r.applied).toEqual([])
    expect(r.rejected[0].reason).toBe("unknown_field")
  })
})
