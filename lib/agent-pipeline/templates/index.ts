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
  /** Character budgets the layout can physically fit. */
  budgets: { headline: number; supporting: number }
  html: string
}

const SHELL = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>{{BUSINESS}}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:850px;height:1100px}
body{font-family:var(--font-body);color:#16181d;background:#fff;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:850px;height:1100px;display:flex;flex-direction:column;overflow:hidden}
h1,h2{font-family:var(--font-heading);font-weight:700;line-height:1.05}
.logo{max-height:56px;max-width:200px;object-fit:contain;display:block}
.qr{width:120px;height:120px;display:block}
.photo{width:100%;height:100%;object-fit:cover;display:block}
</style></head><body><div class="page">${body}</div></body></html>`

export const TEMPLATES: FlyerTemplate[] = [
  {
    id: "banner-hero",
    archetype: "banner-hero",
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

export function templateById(id: string): FlyerTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
