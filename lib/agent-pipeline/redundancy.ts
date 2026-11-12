import * as cheerio from "cheerio"

/**
 * Finds a short "device" — a badge, medallion, ribbon, stamp — whose message is
 * already carried elsewhere on the page.
 *
 * The rule this checks is in prompts/flyer.ts ("Saying the same thing twice is
 * not hierarchy"): a medallion reading "PRIVACY. RECREATION. HOME." above three
 * blocks saying the same three things is one idea competing with itself. A
 * prompt asks for that; this measures whether it happened.
 *
 * A device is a text block of 2–12 content words. It is redundant when at
 * least two thirds of its distinct content words also appear in OTHER blocks
 * — unless it carries a figure (a price, a percentage, a date) found nowhere
 * else on the page. That figure IS a different job, the one the rule names:
 * "$89 / Furnace Tune-Up" in a medallion is the price, labelled; the label
 * naming the service the headline also names doesn't make it a repeat.
 * The business name's own words are ignored everywhere, because a name in the
 * header and again in the footer is a signature, not a repeated message.
 */

const BLOCK = "div,p,h1,h2,h3,h4,h5,h6,li,section,header,footer,article,aside,blockquote,figcaption,td,th,span"
const STOP = new Set([
  "this", "that", "with", "your", "from", "have", "will", "into", "just", "only", "more", "most", "then",
  "than", "they", "them", "their", "there", "here", "what", "when", "where", "which", "while", "about",
  "call", "today", "now", "offer", "valid", "book", "visit", "contact", "free", "save", "near", "every",
])

function words(text: string, ignore: Set<string>): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""))
      .filter((w) => w.length >= 4 && !ignore.has(w)),
  )
}

export interface RedundantDevice {
  /** The device's text, as rendered. */
  device: string
  /** Share of its distinct content words that repeat elsewhere. */
  share: number
  /** The other blocks those words came from (trimmed). */
  repeatedIn: string[]
}

/** Prices, percentages and dates — the things a device can say that words elsewhere don't. */
function figures(text: string): Set<string> {
  const found = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{1,3}\s?%|\b\d{1,2}\/\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi) ?? []
  return new Set(found.map((f) => f.replace(/\s+/g, "").toLowerCase()))
}

export function findRedundantDevices(html: string, businessName = ""): RedundantDevice[] {
  const $ = cheerio.load(html)
  const nameWords = words($("title").text() + " " + businessName, new Set())
  $("script,style,title,noscript").remove()
  const body = $("body").get(0)
  if (!body) return []
  const textOf = (el: unknown) => $(el as never).text().replace(/\s+/g, " ").trim()

  // Leaf-most text blocks: a block with text and no block descendant that has text.
  const leaves = $("body")
    .find(BLOCK)
    .toArray()
    .filter((el) => textOf(el) && !$(el).find(BLOCK).toArray().some((d) => textOf(d)))

  // A device is the WHOLE badge, not one line in it: climb from each leaf to
  // the largest ancestor that is still badge-sized. "$89" and "Furnace
  // Tune-Up" are sibling lines of one medallion, and judging the label alone
  // would miss that the medallion's job is the price.
  const isBadgeSized = (el: unknown) => {
    const t = textOf(el)
    return words(t, nameWords).size <= 12 && t.split(" ").length <= 24
  }
  const devices = new Set<unknown>()
  for (const leaf of leaves) {
    let d: unknown = leaf
    for (let p = $(leaf).parent().get(0); p && p !== body && isBadgeSized(p); p = $(p).parent().get(0)) d = p
    devices.add(d)
  }

  const found: RedundantDevice[] = []
  for (const d of devices) {
    // A headline is the page's primary message, not a device: whether
    // something ELSE repeats it is judged on that other element.
    if ($(d as never).is("h1,h2") || $(d as never).closest("h1,h2").length) continue
    const text = textOf(d)
    const own = words(text, nameWords)
    if (own.size < 2) continue
    const outside = leaves.filter((l) => l !== d && !$(d as never).find(l as never).length)
    const outsideWords = outside.map((l) => ({ text: textOf(l), w: words(textOf(l), nameWords) }))
    const repeated = [...own].filter((w) => outsideWords.some((o) => o.w.has(w)))
    const share = repeated.length / own.size
    if (share < 2 / 3) continue
    const elsewhere = new Set(outsideWords.flatMap((o) => [...figures(o.text)]))
    if ([...figures(text)].some((f) => !elsewhere.has(f))) continue
    found.push({
      device: text.slice(0, 80),
      share,
      repeatedIn: outsideWords.filter((o) => repeated.some((w) => o.w.has(w))).map((o) => o.text.slice(0, 60)).slice(0, 4),
    })
  }
  return found
}

/* --------------------------------- Repair ---------------------------------- */

const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
const DISCLAIMER = /\b(valid|expires?|terms|conditions|restrictions|see (?:store|office)|not valid|limit one|license|lic\.|disclaimer)\b|\*/i

export interface RedundancyRepair {
  html: string
  /** Devices removed because another block already carried their message. */
  removed: string[]
  /** Redundant devices left in place because removing them could lose something that matters. */
  kept: string[]
}

/**
 * Removes a device whose message the page already carries elsewhere — the
 * code half of the "say it once" rule in prompts/flyer.ts, which the forced
 * test showed the model breaking in 1 of 13 generations.
 *
 * Of a redundant pair, the LATER one goes: the earlier is usually the one the
 * eye reaches first, set as the headline or subhead. Only a BADGE-sized
 * device can go — 8 words or fewer, not a sentence of prose, not in a header
 * or footer — and never, whatever the overlap: a headline (h1/h2), a link or
 * button (the call to action), anything holding a phone number, an image or
 * the QR, or anything that reads like a disclaimer. Those are logged as kept.
 *
 * Not for paginated formats: the caller skips proposals entirely. A
 * proposal's prose legitimately repeats "scope" and "pricing", and an early
 * version of this removed one's acceptance clause and its header block.
 */
export function repairRedundancy(html: string, businessName = ""): RedundancyRepair {
  const removed: string[] = []
  const kept: string[] = []
  let current = html
  for (let pass = 0; pass < 4; pass++) {
    const $ = cheerio.load(current)
    const nameWords = words($("title").text() + " " + businessName, new Set())
    const textOf = (el: unknown) => $(el as never).text().replace(/\s+/g, " ").trim()
    const body = $("body").get(0)
    if (!body) break
    const leaves = $("body")
      .find(BLOCK)
      .toArray()
      .filter((el) => !$(el).closest("style,script,title").length && textOf(el) && !$(el).find(BLOCK).toArray().some((d) => textOf(d)))
    const isBadgeSized = (el: unknown) => {
      const t = textOf(el)
      return words(t, nameWords).size <= 12 && t.split(" ").length <= 24
    }
    const devices: unknown[] = []
    for (const leaf of leaves) {
      let d: unknown = leaf
      for (let p = $(leaf).parent().get(0); p && p !== body && isBadgeSized(p); p = $(p).parent().get(0)) d = p
      if (!devices.includes(d)) devices.push(d)
    }
    const flagged = devices.filter((d) => {
      const own = words(textOf(d), nameWords)
      if (own.size < 2) return false
      const outside = leaves.filter((l) => l !== d && !$(d as never).find(l as never).length)
      const ow = outside.map((l) => words(textOf(l), nameWords))
      const repeated = [...own].filter((w) => ow.some((o) => o.has(w)))
      if (repeated.length / own.size < 2 / 3) return false
      const elsewhere = new Set(outside.flatMap((l) => [...figures(textOf(l))]))
      return ![...figures(textOf(d))].some((f) => !elsewhere.has(f))
    })
    const protectedReason = (d: unknown) => {
      const $d = $(d as never)
      const t = textOf(d)
      if (t.split(" ").length > 8) return "longer than a badge"
      if (/[.!?]\s+\S/.test(t) && t.split(" ").length > 5) return "prose"
      if ($d.closest("header,footer").length || $d.find("header,footer").length) return "in a header or footer"
      if ($d.is("h1,h2") || $d.find("h1,h2").length || $d.closest("h1,h2").length) return "a headline"
      if ($d.is("a,button") || $d.find("a,button").length || $d.closest("a,button").length) return "a link or button"
      if (PHONE.test(textOf(d))) return "a phone number"
      if ($d.find("img,svg,canvas").length) return "an image"
      if (DISCLAIMER.test(textOf(d))) return "disclaimer wording"
      return null
    }
    // Later in the document first.
    const target = [...flagged].reverse().find((d) => !protectedReason(d))
    for (const d of flagged) if (d !== target && protectedReason(d)) kept.push(`${textOf(d).slice(0, 60)} (${protectedReason(d)})`)
    if (!target) break
    removed.push(textOf(target).slice(0, 80))
    $(target as never).remove()
    current = $.html()
  }
  return { html: current, removed, kept: [...new Set(kept)] }
}
