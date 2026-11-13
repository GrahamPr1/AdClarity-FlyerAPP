import { getOrgBlob } from "./blob"
import { qrLink } from "./links"
import { getOrIssueQrCode, type ApApproved } from "./store"
import { ID_TOKEN, enrollmentUrlFor } from "./validate"
import { logoHtml, type LogoAnalysis } from "./templates/logo"
import { SIZES, templatesFor, versionStamp, type ApPackage, type Pricing, type Size } from "./templates/content"
import { ApRenderError, renderFlyer, type AgentValues, type Output, type RenderInput } from "./templates/render"
import type { ApAgent, ApFileRef, ApLang, ApOrg } from "./types"

// Flyers for the agent platform: what an org's content renders as, for an
// admin (sample agent, always a PROOF unless it's the approved version) and
// for an agent (the APPROVED version, hash-checked; a PROOF only while the
// org has no approved version).

/** The org-level pieces a page needs, from the live org (drafts) or an approval (approved). */
export interface PageSource {
  orgName: string
  orgCode: string
  footer: ApOrg["footer"]
  languages: ApLang[]
  logo: ApFileRef | null
  packages: ApPackage[]
  approvedAt: string | null
}

export function sourceFromOrg(org: ApOrg, packages: ApPackage[]): PageSource {
  return { orgName: org.name, orgCode: org.orgCode, footer: org.footer, languages: org.languages, logo: org.logo, packages, approvedAt: null }
}

export function sourceFromApproved(a: ApApproved, org: ApOrg): PageSource {
  // A language the org has since switched off isn't offered, even if it was approved.
  return { orgName: a.orgName, orgCode: a.orgCode, footer: a.footer, languages: a.languages.filter((l) => org.languages.includes(l)), logo: a.logo, packages: a.packages, approvedAt: a.approvedAt }
}

const logoCache = new Map<string, string>()
async function logoMarkup(orgId: string, src: PageSource): Promise<string> {
  const ref = src.logo
  if (!ref?.logo) return logoHtml(null, src.orgName)
  let uri = logoCache.get(ref.path)
  if (!uri) {
    const blob = await getOrgBlob(orgId, ref.path)
    if (!blob?.stream) throw new ApRenderError("master_invalid", "the org's logo file is missing")
    const buf = Buffer.from(await new Response(blob.stream).arrayBuffer())
    uri = `data:image/png;base64,${buf.toString("base64")}`
    logoCache.set(ref.path, uri)
  }
  return logoHtml({ dataUri: uri, analysis: ref.logo as LogoAnalysis }, src.orgName)
}

/** The printed address and QR for an agent: per the org's setting, falling back to the QR link. */
export function agentValuesFor(org: ApOrg, a: { name: string; phone: string; externalId: string }, qrCode: string, forceCode = false): AgentValues {
  const qr = qrLink(qrCode)
  const e = org.enrollment
  const mode = forceCode ? "code" : e.printed
  if (mode === "full") {
    const href = enrollmentUrlFor(e, a.externalId)
    const text = href.replace(/^https:\/\//, "")
    const q = text.indexOf("?")
    return { name: a.name, phone: a.phone, link: { href, lines: q > 0 ? [text.slice(0, q), text.slice(q)] : [text] }, qr }
  }
  if (mode === "short" && e.printedTemplate) {
    const text = e.printedTemplate.replace(ID_TOKEN, encodeURIComponent(a.externalId))
    return { name: a.name, phone: a.phone, link: { href: `https://${text}`, lines: [text] }, qr }
  }
  return { name: a.name, phone: a.phone, link: { href: qr, lines: [qr.replace(/^https?:\/\//, "")] }, qr }
}

/** The admin preview's sample agent: obviously fake, a QR code that resolves to nothing. */
export const SAMPLE_AGENT = { name: "Pat Sample", phone: "(555) 555-0123", externalId: "SAMPLE-123" }
export const SAMPLE_QR_CODE = "Smp2345"

export async function inputFor(orgId: string, src: PageSource, pkg: ApPackage, lang: ApLang, pricing: Pricing, size: Size): Promise<Omit<RenderInput, "agent" | "spacing" | "expectHash" | "proof">> {
  const v = pkg.variants[lang]
  if (!v) throw new ApRenderError("master_invalid", `${pkg.id} has no ${lang} content`)
  const stamp = versionStamp(src.orgCode, pkg.layout, lang, src.approvedAt ? new Date(src.approvedAt) : null)
  return {
    layout: pkg.layout,
    lang,
    size,
    showPrice: pricing === "price",
    title: `${src.orgName} · ${v["header.packageLabel"]}`,
    screenLabel: `${v["header.packageLabel"]} · ${v["header.titleLine1"]} ${v["header.titleLine2"]}`,
    logoHtml: await logoMarkup(orgId, src),
    slots: { ...v, "footer.programLine": src.footer.programLine, "footer.taglineLine": src.footer.taglineLine, "footer.versionStamp": stamp },
  }
}

export interface FitProblem {
  package: string
  lang: ApLang
  slot?: string
  message: string
}

/**
 * The save-time fit check: each package, each enabled language, rendered once
 * (Letter, price variant if offered) with the sample agent. Returns every
 * measured problem, naming the slot. Empty = every page fits.
 */
export async function checkFit(org: ApOrg, packages: ApPackage[]): Promise<FitProblem[]> {
  const src = sourceFromOrg(org, packages)
  const out: FitProblem[] = []
  for (const pkg of packages) {
    for (const lang of org.languages) {
      const base = await inputFor(org.id, src, pkg, lang, pkg.pricing.includes("price") ? "price" : "noprice", "letter")
      try {
        await renderFlyer({ ...base, agent: agentValuesFor(org, SAMPLE_AGENT, SAMPLE_QR_CODE), spacing: null, expectHash: null, proof: true }, null)
      } catch (err) {
        if (!(err instanceof ApRenderError)) throw err
        const list = err.problems.length ? err.problems : [{ message: err.message, slot: err.slot }]
        for (const p of list) out.push({ package: pkg.id, lang, slot: p.slot, message: p.message })
      }
    }
  }
  return out
}

/** Renders every offered template at both sizes and records its hash and spacing. Throws on the first failure. */
export async function approvalRenders(org: ApOrg, packages: ApPackage[]): Promise<ApApproved["templates"]> {
  const src = { ...sourceFromOrg(org, packages), approvedAt: new Date().toISOString() }
  return approvalRendersFor(org, src)
}

export async function approvalRendersFor(org: ApOrg, src: PageSource): Promise<ApApproved["templates"]> {
  const out: ApApproved["templates"] = {}
  for (const t of templatesFor(src.packages, src.languages)) {
    for (const size of SIZES) {
      const base = await inputFor(org.id, src, t.pkg, t.lang, t.pricing, size)
      const r = await renderFlyer({ ...base, agent: agentValuesFor(org, SAMPLE_AGENT, SAMPLE_QR_CODE), spacing: null, expectHash: null, proof: false }, null)
      out[`${t.id}:${size}`] = { hash: r.hash, spacing: r.spacing }
    }
  }
  return out
}

/**
 * An agent's flyer. With an approved version: built from the approval's
 * snapshot, using the spacing it recorded, refused unless the page hashes to
 * the approved hash. Without one: a PROOF of the current draft.
 */
export async function renderForAgent(
  org: ApOrg,
  agent: ApAgent,
  source: { approved: ApApproved } | { draft: ApPackage[] },
  t: { pkg: ApPackage; lang: ApLang; pricing: Pricing; id: string },
  size: Size,
  output: Output,
) {
  const src = "approved" in source ? sourceFromApproved(source.approved, org) : sourceFromOrg(org, source.draft)
  const pinned = "approved" in source ? source.approved.templates[`${t.id}:${size}`] : null
  if ("approved" in source && !pinned) throw new ApRenderError("hash_mismatch", `${t.id}:${size} isn't part of the approved version`)
  const base = await inputFor(org.id, src, t.pkg, t.lang, t.pricing, size)
  const code = await getOrIssueQrCode(agent)
  const run = (forceCode: boolean) =>
    renderFlyer({ ...base, agent: agentValuesFor(org, agent, code, forceCode), spacing: pinned?.spacing ?? null, expectHash: pinned?.hash ?? null, proof: !pinned }, output)
  try {
    return await run(false)
  } catch (err) {
    // The printed address doesn't fit beside the QR: print the agent's QR link instead, never smaller text (NOP's rule).
    if (org.enrollment.printed !== "code" && err instanceof ApRenderError && err.problems.some((p) => p.slot === "agent.enroll_link")) return run(true)
    throw err
  }
}
