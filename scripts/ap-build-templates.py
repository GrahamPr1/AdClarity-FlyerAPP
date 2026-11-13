#!/usr/bin/env python3
"""
Builds the agent platform's slotted flyer templates from NOP's kit v2.

READS enterprise/nop/kit-v2 (never writes it). WRITES enterprise/ap/kit-v2:
  _ds/kit/...            the design system (CSS tokens, the six Poppins faces), byte copies
  templates/P1.html ...  one template per layout, every Basic Benefits text node a slot

Each template is NOP's English Letter "Price" page with:
  - <html lang>, <title>, page size, --bleed and the price card's display as {{placeholders}}
  - the design-system path renamed to _ds/kit
  - the logo <img> replaced by {{logo}}
  - every text node in the body wrapped as <span data-ap-slot="key">{{slot:key}}</span>
    (the numbered steps' digits stay fixed)
  - the footer in NOP's approved agent placement (Option B: left column flex:none
    with the version stamp under it, padding 8/32px), its right column {{agent_area}}

tests/ap-templates.test.ts proves it: filling a template with Basic Benefits'
own text reproduces NOP's page outside the footer, byte for byte, once the
slot wrappers are removed.

Usage: python3 scripts/ap-build-templates.py
"""
import html, os, re, shutil

SRC = "enterprise/nop/kit-v2/html"
DST = "enterprise/ap/kit-v2"
DS_SRC = "_ds/basic-benefits-design-system-65e9c885-f032-4927-be79-6ba6a48cd125"
FILES = {"P1": "NOP-P1-Everyday-Care-EN-Price.html", "P2": "NOP-P2-Complete-Virtual-Care-EN-Price.html", "P3": "NOP-P3-Health-Weight-Management-EN-Price.html"}

HEAD2 = ["header.programTag", "header.packageLabel", "header.titleLine1", "header.titleLine2", "header.subtitle", "price.label", "price.1.amount", "price.1.label", "price.2.amount", "price.2.label", "included.label", "included.line1", "included.line2"]
HEAD1 = HEAD2[:8] + HEAD2[10:]
def card(n, b): return [f"card{n}.title", f"card{n}.description"] + [f"card{n}.bullet{i}" for i in range(1, b + 1)]
FOOT = ["disclaimer", "footer.programLine", "footer.taglineLine", "#link", "footer.versionStamp"]
SCHEMA = {
    "P1": HEAD2 + card(1, 4) + card(2, 3) + card(3, 3) + ["steps.label", "#1", "steps.1", "#2", "steps.2", "#3", "steps.3"] + FOOT,
    "P2": HEAD2 + card(1, 4) + card(2, 4) + card(3, 4) + card(4, 3) + ["plus.label", "plus.title", "plus.description"] + FOOT,
    "P3": HEAD1 + card(1, 6) + card(2, 4) + ["engage.line1", "engage.line2", "engage.paragraph", "engage.bullet1", "engage.bullet2", "engage.bullet3"] + FOOT,
}

def one(s, old, new, what):
    n = s.count(old)
    if n != 1: raise SystemExit(f"{what}: expected 1, found {n}")
    return s.replace(old, new)

def build(pkg):
    s = open(os.path.join(SRC, FILES[pkg])).read()
    s = one(s, '<html lang="en">', '<html lang="{{lang}}">', "html lang")
    s = re.sub(r"<title>[^<]*</title>", "<title>{{title}}</title>", s, count=1)
    s = s.replace(DS_SRC + "/", "_ds/kit/")
    s = one(s, "@page{size:8.5in 11in;margin:0}", "@page{size:{{page_w}} {{page_h}};margin:0}", "@page")
    s = one(s, "section.page{width:8.5in;height:11in;", "section.page{width:{{page_w}};height:{{page_h}};", "section size")
    s = one(s, "--bleed:0px;", "--bleed:{{bleed}};", "bleed")
    s = re.sub(r'data-screen-label="[^"]*"', 'data-screen-label="{{screen_label}}"', s, count=1)
    s = re.sub(r'<img src="assets/bb-logo-light\.png"[^>]*>', "{{logo}}", s, count=1)
    if "{{logo}}" not in s: raise SystemExit("logo not found")
    s = re.sub(r'(<div style="display:)flex(;border:1px solid rgba\(255,255,255,\.12\);background:rgba\(255,255,255,\.04\);border-top:3px solid #[0-9A-Fa-f]{6})', r"\1{{price_display}}\2", s, count=1)
    if "{{price_display}}" not in s: raise SystemExit("price card not found")

    # Footer: NOP's approved Option B placement, right column -> {{agent_area}}.
    foot = re.search(r"<footer[\s\S]*?</footer>", s).group(0)
    m = re.search(r'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">\s*<a href="https://neighbor\.basicbenefits\.com" [^>]*>neighbor\.basicbenefits\.com</a>\s*(<span [^>]*>)([^<]*)(</span>)\s*</div>', foot)
    if not m: raise SystemExit("footer right column not found")
    stamp_open, stamp_text, stamp_close = m.group(1), m.group(2), m.group(3)
    f2 = foot.replace(m.group(0), "{{agent_area}}")
    f2 = one(f2, "padding:16px calc(48px + var(--bleed, 0px)) calc(16px + var(--bleed, 0px));", "padding:8px calc(32px + var(--bleed, 0px)) calc(8px + var(--bleed, 0px));", "footer padding")
    lm = re.search(r'(<footer [^>]*>\s*)<div style="display:flex;flex-direction:column;gap:4px;">([\s\S]*?)(\s*</div>)', f2)
    f2 = f2.replace(lm.group(0), f'{lm.group(1)}<div style="display:flex;flex-direction:column;gap:4px;flex:none;">{lm.group(2)}\n      {stamp_open}{stamp_text}{stamp_close}{lm.group(3)}')
    s = s.replace(foot, f2)

    # Slots, in document order.
    start = s.index("<body")
    head, body = s[:start], s[start:]
    keys = [k for k in SCHEMA[pkg]]
    out, i = [], 0
    def repl(mt):
        nonlocal i
        txt = mt.group(1)
        if not txt.strip() or txt.strip() in ("{{logo}}", "{{agent_area}}"): return mt.group(0)
        if i >= len(keys): raise SystemExit(f"{pkg}: more text nodes than slots at {txt!r}")
        k = keys[i]; i += 1
        if k == "#link": raise SystemExit("link should be gone")
        if k.startswith("#"):
            if txt.strip() != k[1:]: raise SystemExit(f"{pkg}: expected step number {k[1:]}, got {txt!r}")
            return mt.group(0)
        lead = txt[: len(txt) - len(txt.lstrip())]; trail = txt[len(txt.rstrip()):]
        return f'>{lead}<span data-ap-slot="{k}">{{{{slot:{k}}}}}</span>{trail}<'
    keys = [k for k in keys if k != "#link"]
    body = re.sub(r">([^<>]+)<", repl, re.sub(r"<style[\s\S]*?</style>", lambda m: m.group(0).replace(">", "\x00"), body))
    body = body.replace("\x00", ">")
    if i != len(keys): raise SystemExit(f"{pkg}: {len(keys) - i} slots unused")
    return head + body

if __name__ == "__main__":
    ds_dst = os.path.join(DST, "_ds", "kit")
    if os.path.exists(ds_dst): shutil.rmtree(ds_dst)
    shutil.copytree(os.path.join(SRC, DS_SRC), ds_dst)
    # The only brand mention in the design system is a CSS comment; neutral in the copy.
    css = os.path.join(ds_dst, "styles.css")
    open(css, "w").write(open(css).read().replace("Basic Benefits Design System", "Flyer kit design system"))
    for pkg in FILES:
        open(os.path.join(DST, "templates", f"{pkg}.html"), "w").write(build(pkg))
        print("wrote", pkg)
