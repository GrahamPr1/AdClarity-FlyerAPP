/**
 * Pre-built flyer templates — template mode's replacement for the Flyer
 * Agent's from-scratch HTML.
 *
 * Format is deliberately boring: an HTML string with {{SLOT}} tokens and CSS
 * custom properties. Filling is split/join, the same mechanism substituteQr
 * and substituteLogo already use, so there is no template engine and no new
 * dependency. Colour and font arrive as variables rather than baked values,
 * which is what lets 2 templates x 24 palettes x 6 font pairings look like
 * far more than 2 designs.
 *
 * Both are ports of existing LAYOUT_ARCHETYPES briefs, so template mode
 * inherits compositions that were already designed rather than inventing new
 * ones.
 *
 * SLOT CONTRACT — every slot is filled in code, never by a model:
 *   {{HEADLINE}} {{SUPPORTING}}  the polish agent's two lines
 *   {{BUSINESS}} {{PHONE}} {{ADDRESS}}
 *   {{LOGO_BLOCK}} {{QR_BLOCK}} {{PHOTO_BLOCK}}  whole blocks, so an absent
 *                                                logo/QR/photo leaves no gap
 */
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
  /** Character budgets the layout can physically fit. Derived by render. */
  budgets: { headline: number; supporting: number }
  html: string
}

/** Canvas sizes at the same ~100dpi scale the flyer already uses (8.5x11in -> 850x1100). */
const CANVAS = {
  flyer: { w: 850, h: 1100 },
  "door-hanger": { w: 350, h: 850 },
  "social-post": { w: 1080, h: 1080 },
} as const

const SHELL = (body: string, size: { w: number; h: number } = CANVAS.flyer) => `<!doctype html><html><head><meta charset="utf-8"><title>{{BUSINESS}}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${size.w}px;height:${size.h}px}
body{font-family:var(--font-body);color:#16181d;background:#fff;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:${size.w}px;height:${size.h}px;display:flex;flex-direction:column;overflow:hidden}
h1,h2{font-family:var(--font-heading);font-weight:700;line-height:1.05}
.logo{max-height:56px;max-width:200px;object-fit:contain;display:block}
.qr{width:120px;height:120px;display:block}
.photo{width:100%;height:100%;object-fit:cover;display:block}
</style></head><body><div class="page">${body}</div></body></html>`

export const TEMPLATES: FlyerTemplate[] = [
  {
    id: "banner-hero",
    archetype: "banner-hero",
    formatIds: ["flyer", "one-pager"],
    // Verified by rendering, not counting: a 52-char headline at 64px over
    // ~738px of usable width wraps to 2 lines and the page does not overflow
    // 1100px. Raised from 42 after 4/20 pilot samples were cut 2-7 chars over,
    // losing the qualifier that made the offer concrete ('installed', 'for
    // dogs under 30 lbs').
    budgets: { headline: 52, supporting: 110 },
    html: SHELL(`
      <header style="background:var(--brand-primary);color:#fff;padding:44px 56px;display:flex;align-items:center;justify-content:space-between;gap:24px">
        <div style="min-width:0">{{LOGO_BLOCK}}<p style="font-size:20px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;margin-top:10px">{{BUSINESS}}</p></div>
      </header>
      <section style="flex:0 0 340px;overflow:hidden;background:var(--brand-secondary)">{{PHOTO_BLOCK}}</section>
      <section style="padding:48px 56px;flex:1 1 auto;overflow:hidden">
        <h1 style="font-size:64px;color:var(--brand-primary)">{{HEADLINE}}</h1>
        <p style="margin-top:22px;font-size:26px;line-height:1.35;color:#3a3f47">{{SUPPORTING}}</p>
      </section>
      <footer style="background:var(--brand-primary);color:#fff;padding:32px 56px;display:flex;align-items:center;justify-content:space-between;gap:28px">
        <div><p style="font-size:34px;font-weight:700;font-family:var(--font-heading)">{{PHONE}}</p>
        <p style="font-size:18px;opacity:.85;margin-top:6px">{{ADDRESS}}</p></div>
        {{QR_BLOCK}}
      </footer>`),
  },
  {
    id: "split-vertical",
    archetype: "split-vertical",
    formatIds: ["flyer", "one-pager"],
    budgets: { headline: 44, supporting: 165 },
    html: SHELL(`
      <div style="display:flex;height:1100px">
        <aside style="flex:0 0 320px;background:var(--brand-primary);color:#fff;padding:44px 32px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">
          <div>{{LOGO_BLOCK}}<p style="font-size:19px;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-top:12px">{{BUSINESS}}</p></div>
          <div>{{QR_BLOCK}}<p style="font-size:26px;font-weight:700;margin-top:16px;font-family:var(--font-heading)">{{PHONE}}</p>
          <p style="font-size:16px;opacity:.8;margin-top:6px">{{ADDRESS}}</p></div>
        </aside>
        <main style="flex:1 1 auto;display:flex;flex-direction:column;overflow:hidden">
          <div style="flex:0 0 420px;overflow:hidden;background:var(--brand-secondary)">{{PHOTO_BLOCK}}</div>
          <div style="padding:52px 48px;flex:1 1 auto;overflow:hidden">
            <h1 style="font-size:58px;color:var(--brand-primary)">{{HEADLINE}}</h1>
            <p style="margin-top:24px;font-size:25px;line-height:1.4;color:#3a3f47">{{SUPPORTING}}</p>
          </div>
        </main>
      </div>`),
  },
]

/* ------------------------- Non-flyer canvases ---------------------------- */

TEMPLATES.push(
  {
    id: "door-hanger-stack",
    archetype: "stacked-bands",
    formatIds: ["door-hanger"],
    // Derived by joint binary search against a real 350x850 render with the
    // heaviest heading stack and worst-case long words: the pair (50, 105) is
    // the largest that fits together. Shipped ~12% under that for margin.
    // Searching each slot independently gave nonsense (a 96-char headline in a
    // 434px column) because it optimises one slot against a starved value of
    // the other — they have to be measured as a pair.
    budgets: { headline: 44, supporting: 92 },
    html: SHELL(
      `
      <div style="flex:0 0 96px;display:flex;align-items:center;justify-content:center">
        <div style="width:44px;height:44px;border-radius:50%;border:3px solid var(--brand-primary);opacity:.35"></div>
      </div>
      <header style="background:var(--brand-primary);color:#fff;padding:20px 22px;text-align:center">
        {{LOGO_BLOCK}}
        <p style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;margin-top:8px">{{BUSINESS}}</p>
      </header>
      <section style="flex:0 0 180px;overflow:hidden;background:var(--brand-secondary)">{{PHOTO_BLOCK}}</section>
      <section style="padding:24px 22px;flex:1 1 auto;overflow:hidden;text-align:center">
        <h1 style="font-size:34px;color:var(--brand-primary)">{{HEADLINE}}</h1>
        <p style="margin-top:14px;font-size:16px;line-height:1.35;color:#3a3f47">{{SUPPORTING}}</p>
      </section>
      <footer style="background:var(--brand-primary);color:#fff;padding:20px 22px;text-align:center">
        <p style="font-size:22px;font-weight:700;font-family:var(--font-heading)">{{PHONE}}</p>
        <p style="font-size:13px;opacity:.85;margin-top:4px">{{ADDRESS}}</p>
        <div style="display:flex;justify-content:center;margin-top:12px">{{QR_BLOCK}}</div>
      </footer>`,
      CANVAS["door-hanger"],
    ),
  },
  {
    id: "social-square",
    archetype: "centred-medallion",
    // This IS the Instagram repurposing template — one artifact, not two.
    formatIds: ["social-post"],
    // Joint max on a real 1080x1080 render is (89, 187); shipped under it.
    budgets: { headline: 78, supporting: 164 },
    html: SHELL(
      `
      <div style="position:relative;width:1080px;height:1080px;overflow:hidden;background:var(--brand-secondary)">
        <div style="position:absolute;inset:0">{{PHOTO_BLOCK}}</div>
        <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.35) 0%,rgba(0,0,0,.72) 62%)"></div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:72px 76px;color:#fff">
          <div>{{LOGO_BLOCK}}<p style="font-size:26px;letter-spacing:.16em;text-transform:uppercase;opacity:.9;margin-top:16px">{{BUSINESS}}</p></div>
          <div>
            <h1 style="font-size:86px;line-height:1.02">{{HEADLINE}}</h1>
            <p style="margin-top:28px;font-size:34px;line-height:1.35;opacity:.94">{{SUPPORTING}}</p>
          </div>
          <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:28px">
            <div><p style="font-size:40px;font-weight:700;font-family:var(--font-heading)">{{PHONE}}</p>
            <p style="font-size:22px;opacity:.85;margin-top:6px">{{ADDRESS}}</p></div>
            {{QR_BLOCK}}
          </div>
        </div>
      </div>`,
      CANVAS["social-post"],
    ),
  },
)

export function templateById(id: string): FlyerTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
