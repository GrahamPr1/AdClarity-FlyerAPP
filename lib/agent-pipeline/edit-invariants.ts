import * as cheerio from "cheerio"

/**
 * What an edit must never break, checked in code after EVERY quick edit or
 * refinement and before anything is saved. A prompt can ask a model to keep
 * the phone number; only a check can guarantee it. Any violation rejects the
 * edit and the previous version stays.
 *
 * Every check compares BEFORE and AFTER, so a flyer that already lacked
 * something (no QR on a trial plan, no logo) is never blocked for it.
 *
 * Pure and synchronous. The rendered-layout half of "print-safe" needs a
 * browser and lives in lib/pdf/flyer-pdf.ts (measureClippedText).
 */

export interface InvariantContext {
  businessName: string | null
  logoUrl: string | null
  /** The flyer's QR image (a data: URL), when it has one. */
  qrDataUrl: string | null
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g
const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{1,3}\s?%|\bfree\b/gi
const CTA_RE = /\b(call|text|book|schedule|scan|visit|order|reserve|claim|get|stop by|come in|contact)\b/i

function visibleText(html: string): string {
  const $ = cheerio.load(html)
  $("script,style,noscript,template").remove()
  return $("body").text().replace(/\s+/g, " ").trim()
}

const digits = (s: string) => s.replace(/\D/g, "").slice(-10)
const phonesIn = (text: string) => [...new Set((text.match(PHONE_RE) ?? []).map(digits))]
const pricesIn = (text: string) => [...new Set((text.match(PRICE_RE) ?? []).map((p) => p.replace(/\s/g, "").toLowerCase()))]
const norm = (s: string) => s.toLowerCase().replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

/** The page geometry a print layout depends on: @page rules and the root/page box sizes. */
function geometry(html: string): string {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n")
  const page = [...css.matchAll(/@page[^{]*\{[^}]*\}/gi)].map((m) => m[0].replace(/\s+/g, ""))
  const boxes = [...css.matchAll(/(?:^|[}\s])(html|body|\.page)\s*(?:,\s*(?:html|body|\.page))*\s*\{[^}]*\}/gi)]
    .map((m) => (m[0].match(/(?:width|height)\s*:\s*[^;}]+/gi) ?? []).join(";").replace(/\s+/g, ""))
    .filter(Boolean)
  return JSON.stringify({ page, boxes })
}

/** The offer badge's fields, as printed (template-mode.ts offerBadge). */
function badgeOf(html: string): { present: boolean; price: string; deadline: string } {
  const $ = cheerio.load(html)
  const slot = $("[data-offer-slot]").first()
  return {
    present: slot.length > 0,
    price: slot.find('[data-field="price"],[data-offer-field="price"]').first().text().trim(),
    deadline: slot.find('[data-field="deadline"],[data-offer-field="deadline"]').first().text().trim(),
  }
}

export function checkEditInvariants(before: string, after: string, instruction: string, ctx: InvariantContext): string[] {
  const problems: string[] = []
  const was = visibleText(before)
  const now = visibleText(after)
  const asked = instruction

  // ---- Phone: never lost, never altered unless the owner asked -------------------
  const askedPhones = phonesIn(asked)
  const replacing = askedPhones.length > 0 && /\b(replace|change|update|swap|correct|fix|switch|new)\b/i.test(asked) && !/\b(add|second|another|also)\b/i.test(asked)
  for (const p of phonesIn(was)) {
    if (!phonesIn(now).includes(p) && !replacing) problems.push("it removed or changed the phone number")
  }
  for (const p of askedPhones) {
    if (!phonesIn(now).includes(p)) problems.push("the phone number you gave isn't on the flyer exactly as written")
  }

  // ---- QR code: still there, still the same image -------------------------------
  if (ctx.qrDataUrl && before.includes(ctx.qrDataUrl) && !after.includes(ctx.qrDataUrl)) {
    problems.push("it removed the QR code")
  }

  // ---- Business name ---------------------------------------------------------------
  if (ctx.businessName && norm(was).includes(norm(ctx.businessName)) && !norm(now).includes(norm(ctx.businessName))) {
    problems.push("it removed the business name")
  }

  // ---- Logo --------------------------------------------------------------------------
  if (ctx.logoUrl) {
    const forms = [ctx.logoUrl, ctx.logoUrl.replace(/&/g, "&amp;")]
    if (forms.some((f) => before.includes(f)) && !forms.some((f) => after.includes(f))) problems.push("it removed the logo")
  }

  // ---- Offer and call to action ---------------------------------------------------
  const pricesBefore = pricesIn(was)
  const pricesNow = pricesIn(now)
  const aboutPrice = /\$|\bprice|\bcost|\bfree\b|discount|%|percent|\boff\b|\bdeal\b|\boffer\b/i.test(asked)
  if (pricesBefore.length && !pricesNow.length && !aboutPrice) problems.push("it dropped the offer's price")
  for (const p of pricesIn(asked).filter((x) => x.startsWith("$"))) {
    if (!pricesNow.includes(p)) problems.push(`the price you asked for (${p}) isn't on the flyer`)
  }
  if (CTA_RE.test(was) && !CTA_RE.test(now)) problems.push("it removed the call to action")

  // ---- The offer badge (template flyers) ------------------------------------------
  // Its price and deadline are the owner's own facts: they change only when the
  // request is about them, and a price the owner states is exactly what prints.
  const badgeBefore = badgeOf(before)
  const badgeNow = badgeOf(after)
  if (badgeBefore.price) {
    const aboutDeadline = /\b(deadline|ends?|until|through|extend|expires?|date|by)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i.test(asked)
    if (!badgeNow.present) problems.push("it removed the offer badge")
    else if (!badgeNow.price) problems.push("it removed the offer's price")
    else if (!aboutPrice && norm(badgeNow.price) !== norm(badgeBefore.price)) problems.push("it changed the offer's price")
    for (const p of pricesIn(asked).filter((x) => x.startsWith("$"))) {
      if (badgeNow.price && !norm(badgeNow.price).replace(/\s/g, "").includes(p)) problems.push(`the offer badge doesn't show ${p}`)
    }
    if (badgeBefore.deadline && !aboutDeadline && norm(badgeNow.deadline) !== norm(badgeBefore.deadline)) problems.push("it changed or removed the offer's deadline")
  }
  if (now.length < Math.min(40, was.length * 0.4)) problems.push("it removed most of the flyer's text")

  // ---- Print-safe: same page geometry, nothing executable ---------------------------
  if (geometry(before) !== geometry(after)) problems.push("it changed the page size or layout box")
  const $ = cheerio.load(after)
  const unsafe =
    $("script,iframe,object,embed").length > 0 ||
    $("*").toArray().some((el) => Object.keys((el as { attribs?: Record<string, string> }).attribs ?? {}).some((a) => /^on/i.test(a))) ||
    /javascript\s*:/i.test(after)
  if (unsafe) problems.push("it added script or other unsafe content")

  return [...new Set(problems)]
}
