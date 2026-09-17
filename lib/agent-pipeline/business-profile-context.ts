import { get } from "@vercel/blob"
import { getBusinessProfile } from "@/lib/store"
import { fetchInfoLinkContent } from "./info-link"
import type { DocumentInput } from "./client"

/**
 * A client's saved business profile, turned into something the Intake Agent
 * can read.
 *
 * Both halves already worked — for form-fill. The PDF goes in as a native
 * document block (Claude reads PDFs directly, so there is no extraction
 * step to build), and a Google Sheets link is fetched through its CSV export
 * endpoint. This adds no new mechanism; it points the existing two at intake.
 *
 * Never throws. A missing blob, an unshared sheet or a dead link degrades to
 * "no extra context" — a client should not lose a campaign they already spent
 * a credit on because a reference document moved.
 */
export interface BusinessProfileContext {
  /** The saved PDF/image, ready to attach to the agent call. */
  documents: DocumentInput[]
  /** Text pulled from the saved link, usually a Google Sheet as CSV. */
  linkContent: string | null
  /** Surfaced in logs only — e.g. a sheet that isn't publicly shared. */
  linkError: string | null
  fileName: string | null
}

const EMPTY: BusinessProfileContext = { documents: [], linkContent: null, linkError: null, fileName: null }

/** Cap what a spreadsheet can contribute, so a 50k-row sheet can't crowd out the form. */
const MAX_LINK_CHARS_FOR_INTAKE = 20_000

export async function loadBusinessProfileContext(email: string): Promise<BusinessProfileContext> {
  const profile = await getBusinessProfile(email).catch(() => null)
  if (!profile) return EMPTY

  const documents: DocumentInput[] = []
  if (profile.file) {
    try {
      const blob = await get(profile.file.blobUrl, { access: "private" })
      if (blob?.stream) {
        const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer())
        documents.push({
          base64: Buffer.from(bytes).toString("base64"),
          mediaType: profile.file.mediaType as DocumentInput["mediaType"],
        })
      }
    } catch (err) {
      console.warn(`[business-profile] ${email}: couldn't read saved file — ${err instanceof Error ? err.message : err}`)
    }
  }

  const { content, error } = profile.link
    ? await fetchInfoLinkContent(profile.link).catch(() => ({ content: null, error: null }))
    : { content: null, error: null }

  if (error) console.warn(`[business-profile] ${email}: ${error}`)

  return {
    documents,
    linkContent: content ? content.slice(0, MAX_LINK_CHARS_FOR_INTAKE) : null,
    linkError: error,
    fileName: profile.file?.fileName ?? null,
  }
}
