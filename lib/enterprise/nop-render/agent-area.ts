// The agent's information area on a kit-v2 flyer: name, phone, enrollment
// link and QR code. Only the markup of the area itself lives here; where it
// goes on the page is the placement's job (footer-placement.ts for Basic
// Benefits' footer proposal). If Basic Benefits add their own agent area
// instead, a different placement uses this same block.
//
// PROPOSAL ONLY: not wired into any route. Agents can't reach kit v2.

/** The QR code itself, and the white quiet zone around it, in inches. */
export const AGENT_QR_IN = 0.7
export const AGENT_QR_QUIET_IN = 0.1
/** The white box holding the QR: code plus quiet zone on each side. */
export const AGENT_QR_BOX_IN = Math.round((AGENT_QR_IN + 2 * AGENT_QR_QUIET_IN) * 1000) / 1000

export interface NopAgentAreaValues {
  name: string
  phone: string
  /** The agent's enrollment URL. Printed (without https://) and used as the link target. */
  enrollUrl: string
  /** The QR's SVG markup, already encoding whatever the QR points to. */
  qrSvg: string
}

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/** Strips the scheme for print: "neighbor.basicbenefits.com/123456". */
export function printedLink(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

/**
 * The area for a dark background: text right-aligned beside the QR. Type
 * matches the footer it replaces (link 15px bold #16B2F7, name 14px semibold
 * white, phone 13px #c2c9dc), so no new styles or fonts are introduced.
 */
export function agentAreaHtml(v: NopAgentAreaValues): string {
  return (
    `<div data-agent-area style="display:flex;align-items:center;gap:16px;min-width:0;">` +
    `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right;min-width:0;">` +
    `<a data-agent-field="enroll_link" href="${esc(v.enrollUrl)}" style="font-size:15px;font-weight:700;color:#16B2F7;white-space:nowrap;">${esc(printedLink(v.enrollUrl))}</a>` +
    `<span data-agent-field="name" style="font-size:14px;font-weight:600;letter-spacing:.3px;color:#fff;white-space:nowrap;">${esc(v.name)}</span>` +
    `<span data-agent-field="phone" style="font-size:13px;color:#c2c9dc;white-space:nowrap;">${esc(v.phone)}</span>` +
    `</div>` +
    `<div data-agent-field="qr" style="flex:none;box-sizing:border-box;width:${AGENT_QR_BOX_IN}in;height:${AGENT_QR_BOX_IN}in;padding:${AGENT_QR_QUIET_IN}in;background:#fff;">` +
    v.qrSvg.replace("<svg ", `<svg width="${AGENT_QR_IN}in" height="${AGENT_QR_IN}in" shape-rendering="crispEdges" style="display:block" `) +
    `</div>` +
    `</div>`
  )
}
