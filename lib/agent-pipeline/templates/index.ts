/**
 * Pre-built flyer templates — template mode's replacement for the Flyer
 * Agent's from-scratch HTML.
 *
 * Each template is an HTML string with {{SLOT}} tokens plus the GEOMETRY of
 * the boxes its text has to fit. Filling (template-mode.ts) is split/join, the
 * same mechanism substituteQr and substituteLogo use — no template engine, no
 * new dependency. Colour, font and every font SIZE arrive as CSS custom
 * properties chosen in code, which is what lets a few layouts look like many.
 *
 * All four are ports of LAYOUT_ARCHETYPES briefs, so template mode inherits
 * compositions that were already designed rather than inventing new ones.
 *
 * WHY GEOMETRY LIVES HERE. Every region is overflow:hidden so nothing can
 * spill into its neighbour — which means text that doesn't fit is silently
 * CUT, not visibly broken. So nothing is left to the browser: layout() states
 * the exact width and height each text slot gets for a given combination of
 * logo / QR / photo, and fillTemplate picks font sizes (and, as a last resort,
 * trims words) so the text provably fits that box in the widest of the fonts
 * the PDF renderer can use. Verified per render by scripts/template-stress.ts.
 *
 * SLOT CONTRACT — every slot is filled in code, never by a model:
 *   {{HEADLINE}} {{SUPPORTING}}  the polish agent's two lines
 *   {{BUSINESS}} {{PHONE}} {{ADDRESS}}
 *   {{LOGO_BLOCK}} {{QR_BLOCK}}  whole blocks, so an absent logo/QR leaves no gap
 *   {{MEDIA}}                    the photo, or — with no photo — the template's
 *                                secondary band (never a flat colour block)
 */

/** A box one text slot must fit: its size steps (largest first) and its line limit. */
export interface SlotBox {
  width: number
  height: number
  sizes: number[]
  lineHeight: number
  /** Average glyph advance as a fraction of the font size, in the widest supported font. */
  charWidth: number
}

/** The shared box the headline and supporting line are fitted into together. */
export interface TextBox {
  width: number
  height: number
  headlineSizes: number[]
  supportingSizes: number[]
  /** Gap between headline and supporting line, as a fraction of the headline size. */
  gap: number
}

export interface TemplateLayout {
  text: TextBox
  business: SlotBox
  phone: SlotBox
  address: SlotBox
  /** Layout CSS variables (heights, widths) for this combination. */
  vars: Record<string, string>
}

export interface LayoutContext {
  hasLogo: boolean
  hasQr: boolean
  hasPhoto: boolean
}

export interface FlyerTemplate {
  id: string
  /** The LAYOUT_ARCHETYPES name this is a port of. */
  archetype: string
  /**
   * Which OutputFormat ids this layout can render.
   *
   * Not cosmetic: a 1080x1080 square composition on a 3.5in door hanger is
   * not a styling mismatch, it is a broken piece. selectTemplate filters on
   * this, because the moment non-flyer templates exist an unfiltered pick
   * will eventually put one on the wrong canvas.
   */
  formatIds: string[]
  /**
   * Character budgets handed to the polish agent and enforced by applyBudget
   * before fitting — the most a slot can carry at its SMALLEST size. The
   * fitter then picks the largest size the actual text allows.
   */
  budgets: { headline: number; supporting: number }
  canvas: { w: number; h: number }
  layout(ctx: LayoutContext): TemplateLayout
  html: string
  /** {{MEDIA}} with a photo ({{PHOTO_SRC}} inside) and without one. */
  media: { photo: string; none: string }
}

/** Canvas sizes at the same ~100dpi scale the flyer already uses (8.5x11in -> 850x1100). */
const CANVAS = {
  flyer: { w: 850, h: 1100 },
  "door-hanger": { w: 350, h: 850 },
  "social-post": { w: 1080, h: 1080 },
} as const

/**
 * The physical page each canvas is meant to come out on. The SHELL below
 * emits no @page, so without this a door hanger printed (and exported to
 * PDF) onto a letter sheet. Applied on read by ensurePageSize() rather than
 * written into SHELL, so every template flyer already stored is fixed too and
 * the stored HTML download stays byte-for-byte what it was. The social square
 * matches what the AI path's Instagram document declares.
 */
export const CANVAS_PAGE_SIZE: Record<string, string> = {
  [`${CANVAS.flyer.w}x${CANVAS.flyer.h}`]: "8.5in 11in",
  [`${CANVAS["door-hanger"].w}x${CANVAS["door-hanger"].h}`]: "3.5in 8.5in",
  [`${CANVAS["social-post"].w}x${CANVAS["social-post"].h}`]: "1080px 1080px",
}

/*
 * Glyph widths, measured (scripts/lib/measure-glyphs.ts) as average advance /
 * font size across every curated pairing, in both the bundled production
 * faces and a Mac's own: mixed-case headings top out at 0.600 (Cousine, the
 * typewriter pairing) and 0.564 (Archivo Black); all-caps at 0.705; body text
 * at 0.46, bold body slightly more. Each value below sits above its measured
 * worst case, so a size chosen against it fits whichever font the client — or
 * a later quick edit's "look" — picks.
 */
export const CW_HEADING = 0.63
export const CW_BODY = 0.52
/** All-caps with the .12em tracking the business-name lines use. */
const CW_CAPS_TRACKED = 0.72 + 0.12

export const LH = { headline: 1.08, supporting: 1.35, business: 1.25, phone: 1.2, address: 1.35 }

const SHELL = (body: string, size: { w: number; h: number }) => `<!doctype html><html><head><meta charset="utf-8"><title>{{BUSINESS}}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${size.w}px;height:${size.h}px}
body{font-family:var(--font-body);color:#16181d;background:#fff;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:${size.w}px;height:${size.h}px;display:flex;flex-direction:column;overflow:hidden;position:relative}
h1,h2{font-family:var(--font-heading);font-weight:700}
.logo{max-height:var(--logo-h,56px);max-width:200px;object-fit:contain;display:block}
.qr{width:var(--qr,120px);height:var(--qr,120px);display:block;flex:0 0 auto}
.photo{width:100%;height:100%;object-fit:cover;display:block}
.fit{overflow-wrap:anywhere}
.biz{font-size:var(--biz);line-height:${LH.business};letter-spacing:.12em;text-transform:uppercase}
.h1{font-size:var(--h1);line-height:${LH.headline}}
.sup{font-size:var(--sup);line-height:${LH.supporting};margin-top:var(--gap)}
.phone{font-size:var(--phone);line-height:${LH.phone};font-weight:700;font-family:var(--font-heading)}
.addr{font-size:var(--addr);line-height:${LH.address};margin-top:4px}
.band{background:var(--tint);position:relative;overflow:hidden}
.band::after{content:"";position:absolute;background:var(--brand-accent)}
</style></head><body><div class="page" {{PAGE_ATTRS}}>${body}</div></body></html>`

/** The same slot boxes most templates use for contact lines. */
const phoneBox = (width: number, max = 36): SlotBox => ({
  width,
  height: Math.ceil(max * LH.phone),
  sizes: [36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16].filter((s) => s <= max),
  lineHeight: LH.phone,
  charWidth: CW_HEADING,
})
const addressBox = (width: number, lines: number, max = 18): SlotBox => ({
  width,
  height: Math.ceil(lines * max * LH.address),
  sizes: [18, 17, 16, 15, 14, 13, 12, 11].filter((s) => s <= max),
  lineHeight: LH.address,
  charWidth: CW_BODY,
})
const businessBox = (width: number, height: number, max = 22): SlotBox => ({
  width,
  height,
  sizes: [26, 24, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10].filter((s) => s <= max),
  lineHeight: LH.business,
  charWidth: CW_CAPS_TRACKED,
})

/**
 * Size steps, largest first. Each template filters them to its own range,
 * and the floor of that range is a legibility guarantee: copy that would need
 * smaller type loses words instead (fitText trims the supporting line first).
 */
const sizes = (all: number[], min: number, max: number) => all.filter((s) => s >= min && s <= max)
const HEADLINE_SIZES = [200, 184, 168, 152, 140, 128, 116, 104, 96, 88, 80, 72, 66, 60, 54, 48, 44, 40, 36, 32, 30, 28, 26, 24, 22, 20]
const SUPPORTING_SIZES = [80, 72, 64, 58, 52, 48, 44, 40, 36, 32, 30, 28, 26, 24, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12]

export const TEMPLATES: FlyerTemplate[] = [
  {
    // Full-width colour band across the top, the offer immediately beneath in
    // the largest type on the page, a strong footer bar with contact details.
    id: "banner-hero",
    archetype: "banner-hero",
    formatIds: ["flyer", "one-pager"],
    budgets: { headline: 52, supporting: 110 },
    canvas: CANVAS.flyer,
    layout({ hasLogo, hasQr, hasPhoto }) {
      const header = hasLogo ? 172 : 128
      const footer = 184
      // The photo may give way to 240px when the copy needs the room, and
      // grows into whatever the copy doesn't use (see media.photo).
      const media = hasPhoto ? 240 : 96
      const padX = 56
      const width = CANVAS.flyer.w - padX * 2
      return {
        text: {
          width,
          height: CANVAS.flyer.h - header - footer - media - 80,
          headlineSizes: sizes(HEADLINE_SIZES, 40, 200),
          supportingSizes: sizes(SUPPORTING_SIZES, 20, 80),
          gap: 0.22,
        },
        // header inner height (minus 32px padding top and bottom), minus the
        // logo and the 10px margin above the name
        business: businessBox(width, header - 64 - 10 - (hasLogo ? 56 : 0)),
        phone: phoneBox(width - (hasQr ? 148 : 0)),
        address: addressBox(width - (hasQr ? 148 : 0), 2),
        // With a photo, the photo takes any height the text doesn't use.
        vars: { "--header-h": `${header}px`, "--footer-h": `${footer}px`, "--media-h": `${media}px`, "--text-grow": hasPhoto ? "0" : "1" },
      }
    },
    html: SHELL(
      `
      <header style="flex:0 0 var(--header-h);background:var(--brand-primary);color:var(--on-primary);padding:32px 56px;display:flex;flex-direction:column;justify-content:center;overflow:hidden">
        {{LOGO_BLOCK}}
        <p class="biz fit" style="margin-top:10px;opacity:.92">{{BUSINESS}}</p>
      </header>
      {{MEDIA}}
      <section style="flex:var(--text-grow) 0 auto;padding:40px 56px;display:flex;flex-direction:column;justify-content:center;text-align:center;overflow:hidden">
        <h1 class="h1 fit" style="color:var(--ink)">{{HEADLINE}}</h1>
        <p class="sup fit" style="color:#3a3f47">{{SUPPORTING}}</p>
      </section>
      <footer style="flex:0 0 var(--footer-h);background:var(--brand-primary);color:var(--on-primary);padding:32px 56px;display:flex;align-items:center;justify-content:space-between;gap:28px;overflow:hidden">
        <div style="min-width:0"><p class="phone fit">{{PHONE}}</p>
        <p class="addr fit" style="opacity:.92">{{ADDRESS}}</p></div>
        {{QR_BLOCK}}
      </footer>`,
      CANVAS.flyer,
    ),
    media: {
      // With a photo the band GROWS into any height the text doesn't use, so
      // short copy never leaves a void; it never shrinks below 340px.
      photo: `<section style="flex:1 1 0;min-height:var(--media-h);overflow:hidden;background:var(--tint)"><img class="photo" src="{{PHOTO_SRC}}" alt="" /></section>`,
      // Option A: a short tinted band with an accent rule. No invented text.
      none: `<section class="band" style="flex:0 0 var(--media-h)"><style>.band::after{left:56px;right:56px;top:calc(50% - 4px);height:8px;border-radius:4px}</style></section>`,
    },
  },
  {
    // A solid colour panel on one side carrying the headline and offer; the
    // other side holds the photo or the secondary band. Contact details run
    // along the bottom of the full width.
    id: "split-vertical",
    archetype: "split-vertical",
    formatIds: ["flyer", "one-pager"],
    budgets: { headline: 52, supporting: 140 },
    canvas: CANVAS.flyer,
    layout({ hasLogo, hasQr, hasPhoto }) {
      const footer = 184
      const panel = hasPhoto ? 480 : 690
      const padX = 44
      const width = panel - padX * 2
      const top = hasLogo ? 56 + 10 + 48 : 64
      return {
        text: {
          width,
          // row height, minus panel padding (48 top + 48 bottom), the logo /
          // business block and the gap under it
          height: CANVAS.flyer.h - footer - 96 - top - 40,
          headlineSizes: sizes(HEADLINE_SIZES, 40, 200),
          supportingSizes: sizes(SUPPORTING_SIZES, 20, 80),
          gap: 0.24,
        },
        business: businessBox(width, top - 10 - (hasLogo ? 56 : 0), 26),
        phone: phoneBox(CANVAS.flyer.w - 112 - (hasQr ? 148 : 0)),
        address: addressBox(CANVAS.flyer.w - 112 - (hasQr ? 148 : 0), 2),
        vars: { "--panel-w": `${panel}px`, "--footer-h": `${footer}px`, "--top-h": `${top}px` },
      }
    },
    html: SHELL(
      `
      <div style="display:flex;flex:1 1 auto;min-height:0">
        <aside style="flex:0 0 var(--panel-w);background:var(--brand-primary);color:var(--on-primary);padding:48px 44px;display:flex;flex-direction:column;overflow:hidden">
          <div style="flex:0 0 var(--top-h);display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden">{{LOGO_BLOCK}}
        <p class="biz fit" style="margin-top:10px;opacity:.92">{{BUSINESS}}</p></div>
          <div style="flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;text-align:center;margin-top:40px;overflow:hidden">
            <h1 class="h1 fit">{{HEADLINE}}</h1>
            <p class="sup fit" style="opacity:.94">{{SUPPORTING}}</p>
          </div>
        </aside>
        {{MEDIA}}
      </div>
      <footer style="flex:0 0 var(--footer-h);border-top:8px solid var(--brand-accent);padding:24px 56px 32px;display:flex;align-items:center;justify-content:space-between;gap:28px;overflow:hidden">
        <div style="min-width:0"><p class="phone fit" style="color:var(--ink)">{{PHONE}}</p>
        <p class="addr fit" style="color:#3a3f47">{{ADDRESS}}</p></div>
        {{QR_BLOCK}}
      </footer>`,
      CANVAS.flyer,
    ),
    media: {
      photo: `<div style="flex:1 1 auto;overflow:hidden;background:var(--tint)"><img class="photo" src="{{PHOTO_SRC}}" alt="" /></div>`,
      // Option A, turned on its side: a tinted band with an accent rule.
      none: `<div class="band" style="flex:1 1 auto"><style>.band::after{top:48px;bottom:48px;left:calc(50% - 4px);width:8px;border-radius:4px}</style></div>`,
    },
  },
]

/* ------------------------- Non-flyer canvases ---------------------------- */

TEMPLATES.push(
  {
    id: "door-hanger-stack",
    archetype: "stacked-bands",
    formatIds: ["door-hanger"],
    budgets: { headline: 44, supporting: 92 },
    canvas: CANVAS["door-hanger"],
    layout({ hasLogo, hasQr, hasPhoto }) {
      const hole = 96
      const header = hasLogo ? 112 : 84
      const footer = hasQr ? 226 : 108
      const media = hasPhoto ? 130 : 56
      const width = CANVAS["door-hanger"].w - 40
      return {
        text: {
          width,
          height: CANVAS["door-hanger"].h - hole - header - footer - media - 40,
          headlineSizes: sizes(HEADLINE_SIZES, 22, 72),
          supportingSizes: sizes(SUPPORTING_SIZES, 13, 28),
          gap: 0.26,
        },
        business: businessBox(width, header - 32 - 8 - (hasLogo ? 40 : 0), 15),
        phone: phoneBox(width, 24),
        address: addressBox(width, 2, 13),
        vars: { "--header-h": `${header}px`, "--footer-h": `${footer}px`, "--media-h": `${media}px`, "--logo-h": "40px", "--qr": "110px", "--text-grow": hasPhoto ? "0" : "1" },
      }
    },
    html: SHELL(
      `
      <div style="flex:0 0 96px;display:flex;align-items:center;justify-content:center">
        <div style="width:44px;height:44px;border-radius:50%;border:3px solid var(--brand-primary);opacity:.35"></div>
      </div>
      <header style="flex:0 0 var(--header-h);background:var(--brand-primary);color:var(--on-primary);padding:16px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden">
        {{LOGO_BLOCK}}
        <p class="biz fit" style="margin-top:8px;opacity:.94">{{BUSINESS}}</p>
      </header>
      {{MEDIA}}
      <section style="flex:var(--text-grow) 0 auto;padding:20px;display:flex;flex-direction:column;justify-content:center;text-align:center;overflow:hidden">
        <h1 class="h1 fit" style="color:var(--ink)">{{HEADLINE}}</h1>
        <p class="sup fit" style="color:#3a3f47">{{SUPPORTING}}</p>
      </section>
      <footer style="flex:0 0 var(--footer-h);background:var(--brand-primary);color:var(--on-primary);padding:16px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden">
        <p class="phone fit">{{PHONE}}</p>
        <p class="addr fit" style="opacity:.94">{{ADDRESS}}</p>
        <div style="display:flex;justify-content:center;margin-top:10px">{{QR_BLOCK}}</div>
      </footer>`,
      CANVAS["door-hanger"],
    ),
    media: {
      photo: `<section style="flex:1 1 0;min-height:var(--media-h);overflow:hidden;background:var(--tint)"><img class="photo" src="{{PHOTO_SRC}}" alt="" /></section>`,
      none: `<section class="band" style="flex:0 0 var(--media-h)"><style>.band::after{left:40px;right:40px;top:calc(50% - 3px);height:6px;border-radius:3px}</style></section>`,
    },
  },
  {
    // Centred medallion: the offer sits in a centred solid panel — the focal
    // point — with the business above and contact details below, each on its
    // own solid ground. NO text is ever set directly on photo pixels: a stock
    // photo can carry its own lettering (one production square put the
    // headline over a box of tape printed "ROOFING"), and no gradient makes
    // that legible. Solid grounds make contrast a property of the palette,
    // which code controls, not of the photo, which it can't.
    id: "social-square",
    archetype: "centred-medallion",
    // This IS the Instagram repurposing template — one artifact, not two.
    formatIds: ["social-post"],
    budgets: { headline: 78, supporting: 164 },
    canvas: CANVAS["social-post"],
    layout({ hasLogo, hasQr, hasPhoto }) {
      const margin = 64
      const top = hasLogo ? 132 : 92
      const bottom = hasQr ? 200 : 132
      const panelW = CANVAS["social-post"].w - margin * 2
      const padX = 64
      return {
        text: {
          width: panelW - padX * 2,
          // canvas, minus the two margins, the top and bottom bars, the two
          // gaps around the medallion (40 each) and its own padding (56 each)
          height: CANVAS["social-post"].h - margin * 2 - top - bottom - 80 - 112,
          headlineSizes: sizes(HEADLINE_SIZES, 44, 184),
          supportingSizes: sizes(SUPPORTING_SIZES, 22, 64),
          gap: 0.22,
        },
        business: businessBox(panelW - 64, top - 40 - 8 - (hasLogo ? 48 : 0), 26),
        phone: phoneBox(panelW - 64 - (hasQr ? 160 : 0), 44),
        address: addressBox(panelW - 64 - (hasQr ? 160 : 0), 2, 22),
        vars: {
          "--top-h": `${top}px`,
          "--bottom-h": `${bottom}px`,
          // Without a photo the medallion fills the middle, so the tint field
          // is a frame around it rather than an empty expanse.
          "--medallion-grow": hasPhoto ? "0" : "1",
          "--medallion-h": hasPhoto ? "auto" : "100%",
          "--logo-h": "48px",
          "--qr": "136px",
        },
      }
    },
    html: SHELL(
      `
      {{MEDIA}}
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:64px;gap:40px">
        <div style="flex:0 0 var(--top-h);align-self:flex-start;max-width:100%;background:var(--brand-primary);color:var(--on-primary);border-radius:18px;padding:20px 32px;display:flex;flex-direction:column;justify-content:center;overflow:hidden">
          {{LOGO_BLOCK}}
        <p class="biz fit" style="margin-top:8px">{{BUSINESS}}</p>
        </div>
        <div style="flex:var(--medallion-grow) 1 auto;display:flex;align-items:center;justify-content:center;min-height:0">
          <div style="width:100%;height:var(--medallion-h);max-height:100%;background:var(--brand-primary);color:var(--on-primary);border-radius:40px;border:6px solid var(--brand-accent);padding:50px 58px;text-align:center;display:flex;flex-direction:column;justify-content:center;overflow:hidden">
            <h1 class="h1 fit">{{HEADLINE}}</h1>
            <p class="sup fit" style="opacity:.95">{{SUPPORTING}}</p>
          </div>
        </div>
        <div style="flex:0 0 var(--bottom-h);background:var(--brand-primary);color:var(--on-primary);border-radius:18px;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px;overflow:hidden">
          <div style="min-width:0"><p class="phone fit">{{PHONE}}</p>
        <p class="addr fit" style="opacity:.94">{{ADDRESS}}</p></div>
          {{QR_BLOCK}}
        </div>
      </div>`,
      CANVAS["social-post"],
    ),
    media: {
      photo: `<div style="position:absolute;inset:0;background:var(--tint)"><img class="photo" src="{{PHOTO_SRC}}" alt="" /></div>`,
      // Option A as a field: the tint, with the accent rule across the top.
      none: `<div class="band" style="position:absolute;inset:0"><style>.band::after{left:64px;right:64px;top:28px;height:10px;border-radius:5px}</style></div>`,
    },
  },
)

export function templateById(id: string): FlyerTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
