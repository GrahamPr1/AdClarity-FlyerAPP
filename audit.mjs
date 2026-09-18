import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'

/**
 * Dark-mode contrast audit that measures the REAL backdrop.
 *
 * The previous version walked backgroundColor up the DOM and skipped any
 * element with a background-image ancestor — which silently excluded 9 of 19
 * elements on /login and reported "0 failures".
 *
 * This renders the page twice: once normally, once with every glyph made
 * transparent. The second pass is the true composited backdrop at every
 * pixel — gradients, images, glass, backdrop-filter and all — so nothing has
 * to be skipped or approximated.
 */
const B = process.env.TARGET || 'http://localhost:3000'
const OUT = process.env.OUT
const TAG = process.env.TAG || 'run'
const THEME = process.env.THEME === 'light' ? 'light' : 'dark'

const lum = ({r,g,b}) => { const f=v=>{const s=v/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
const ratio = (a,b) => { const la=lum(a), lb=lum(b); const [h,l]=la>lb?[la,lb]:[lb,la]; return (h+0.05)/(l+0.05) }
const parse = c => { const m=(c||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null }
const over = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1 })

// Colours and a stable id, tagged BEFORE the backdrop pass.
const COLLECT = () => {
  const out=[]
  let n=0
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName==='IFRAME' || el.closest('iframe')) continue
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim()
    if (!own || own.length<2) continue
    const r=el.getBoundingClientRect()
    if (r.width<3 || r.height<3) continue
    if (r.bottom<0 || r.top>document.documentElement.scrollHeight) continue
    const cs=getComputedStyle(el)
    if (cs.visibility==='hidden' || cs.display==='none' || +cs.opacity===0) continue
    const size=parseFloat(cs.fontSize), bold=+cs.fontWeight>=600

    // Effective opacity, and whether anything above us is 3D-projected.
    //
    // Two things make a sampled backdrop a lie, and BOTH produced confident
    // sub-2:1 "failures" in earlier runs:
    //
    //  - opacity < 1 dims the glyph and its own background together, so
    //    compositing a full-strength text colour over the dimmed pixel
    //    invents a contrast loss that is not on screen. Every instance here
    //    was a disabled:opacity-60 button, which WCAG 1.4.3 exempts anyway.
    //  - inside a perspective/preserve-3d stage, getBoundingClientRect does
    //    not describe where the element is actually painted, so the sampler
    //    reads whatever sits behind it. That is how three correctly-themed
    //    bg-card satellites (7.2:1) were reported at 1.0-2.0:1 against the
    //    white flyer they float over.
    //
    // Neither is silently dropped. Both are counted and printed, because an
    // element quietly removed from the denominator is the original bug.
    let eff=1, threeD=false, disabled=!!el.closest('[disabled],[aria-disabled="true"]')
    for (let a=el; a && a!==document.documentElement; a=a.parentElement) {
      const c=getComputedStyle(a)
      eff *= +c.opacity
      if (c.transformStyle==='preserve-3d' || c.perspective!=='none' ||
          /matrix3d|translateZ|rotate[XY]/.test(c.transform)) threeD=true
    }
    const id='a'+(n++)
    el.setAttribute('data-audit-id', id)
    out.push({ id, text:own.slice(0,42), color:cs.color, need: size>=24||(size>=18.66&&bold)?3:4.5,
      cls:(el.className||'').toString().slice(0,52), tag:el.tagName.toLowerCase(),
      eff:+eff.toFixed(3), threeD, disabled })
  }
  return out
}

const PAGES = [
  ['home','/',null],
  // ANON: a signed-in session is redirected straight off /login and
  // /forgot-password, so auditing them with cookies photographs the dashboard
  // and files it under "login" — which is how a previous run reported three
  // different page names from one login form. These two must run signed out.
  ['login','/login',null,'anon'],
  ['dashboard','/dashboard', async pg=>{ await pg.getByRole('button',{name:/Track by channel/i}).first().click().catch(()=>{}) }],
  ['profile','/profile',null],
  ['onboarding-choose','/onboarding',null],
  ['onboarding-form','/onboarding', async pg=>{
      await pg.getByRole('button',{name:/Guided Setup/i}).click().catch(()=>{}); await pg.waitForTimeout(600)
      await pg.getByRole('button',{name:/No, I'll answer/i}).click().catch(()=>{}); await pg.waitForTimeout(600)
      await pg.getByRole('button',{name:'Contractor',exact:true}).click().catch(()=>{}) }],
  ['onboarding-brand','/onboarding', async pg=>{
      await pg.getByRole('button',{name:/Guided Setup/i}).click().catch(()=>{}); await pg.waitForTimeout(500)
      await pg.getByRole('button',{name:/No, I'll answer/i}).click().catch(()=>{}); await pg.waitForTimeout(600)
      await pg.getByRole('button',{name:'Contractor',exact:true}).click().catch(()=>{}); await pg.waitForTimeout(300)
      for(let s=0;s<6;s++){
        for(const sm of await pg.locator('summary').all()){ await sm.click().catch(()=>{}); await pg.waitForTimeout(200) }
        if(await pg.locator('#logo').isVisible().catch(()=>false)) break
        const ins=pg.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible')
        for(let i=0;i<await ins.count();i++){const e=ins.nth(i); if(!(await e.inputValue().catch(()=>"x"))) await e.fill("Pearl Roofing").catch(()=>{})}
        await pg.getByRole('button',{name:/^Continue$/}).first().click().catch(()=>{}); await pg.waitForTimeout(600)
      } }],
  ['forgot','/forgot-password',null,'anon'],
  ['pricing-home','/#pricing',null],
  // Mobile viewport, nav opened. The menu is lg:hidden and sits at opacity:0
  // on a 1366px viewport, so seven links — Log In and the primary CTA among
  // them — were never once measured by any desktop-only run.
  ['home-mobile-nav','/', async pg=>{
      await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(600)
      await pg.getByRole('button',{name:/menu|open/i}).first().click().catch(()=>{})
      await pg.waitForTimeout(900) }],
]

const login = await fetch(B+'/api/auth/client-login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:process.env.ACC_EMAIL,password:process.env.ACCOUNT_PASSWORD})}).catch(()=>null)
const cookies = login && login.ok ? login.headers.getSetCookie().map(c=>{const[nv]=c.split(';');const i=nv.indexOf('=');return{name:nv.slice(0,i),value:nv.slice(i+1),domain:new URL(B).hostname,path:'/'}}) : []

// Refuse to run signed-out. Without a session /dashboard, /profile and every
// /onboarding step silently 302 to /login, and the audit then reports nine
// happy elements per page while never once looking at the pages it names.
// A previous run did exactly that — three different page names all photographed
// the same login form — which is the "0 failures meant 9 never checked" failure
// wearing a different hat. An audit that cannot see the page must say so.
if (!cookies.length) {
  console.error('\n  ABORT: not signed in (set ACC_EMAIL + ACCOUNT_PASSWORD).')
  console.error('  Auditing signed-out would silently measure /login in place of dashboard, profile and onboarding.\n')
  process.exit(1)
}

const browser=await chromium.launch()
let grand={inspected:0,failed:0,excluded:0}
const report=[]
for (const [name,url,prep,anon] of PAGES) {
  const ctx=await browser.newContext({viewport:{width:1366,height:1000},deviceScaleFactor:1})
  if(cookies.length && !anon) await ctx.addCookies(cookies)
  await ctx.addInitScript(t=>localStorage.setItem('oneflyer:theme',t), THEME)
  await ctx.route('**/api/account/theme', r=>r.request().method()==='GET'
    ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({theme:THEME})}) : r.continue())
  const p=await ctx.newPage()
  try {
    await p.goto(B+url,{waitUntil:'networkidle',timeout:45000}); await p.waitForTimeout(2200)
    if(prep){ await prep(p); await p.waitForTimeout(1200) }
    // Report the page we actually landed on, never the one we asked for.
    const landed = new URL(p.url()).pathname
    if (anon && landed !== new URL(B+url).pathname) {
      report.push([name,0,0,[`REDIRECTED to ${landed} — signed-out page not audited`]]); await ctx.close(); continue
    }
    if (!anon && landed === '/login') {
      report.push([name,0,0,[`REDIRECTED to /login — not audited`]]); await ctx.close(); continue
    }
    const isDark = await p.evaluate(()=>document.documentElement.classList.contains('dark'))
    if(isDark !== (THEME==='dark')) { report.push([name,0,0,[{text:`NOT IN ${THEME.toUpperCase()} MODE`}]]); await ctx.close(); continue }

    // Scroll the whole page first, then return to the top.
    //
    // Sections below the fold sit in scroll-reveal wrappers that start at
    // opacity:0 and only animate in when their IntersectionObserver fires. A
    // fullPage screenshot does NOT fire those observers, so the first run
    // photographed straight through five still-invisible buttons and reported
    // white behind a blue pill — "Get the Pro Plan" at 1.04:1, which the very
    // same element measured at 5.61:1 once revealed. Waking every section
    // before measuring is the difference between auditing the page a user
    // sees and auditing one frozen mid-animation.
    await p.evaluate(async () => {
      // behavior:'instant' and a position-driven loop, NOT scrollTo(y) in a
      // fixed for-loop. The page sets scroll-behavior:smooth, so each scrollTo
      // animates; at 160ms a step the viewport never caught up and the sweep
      // topped out at 5817px of a 10323px page. The bottom 44% of the homepage
      // was therefore never scrolled into view, its IntersectionObservers never
      // fired, and ~97 elements stayed at opacity:0 — unscored, and reported as
      // nothing at all. Drive by where we actually ARE, and stop when the
      // position stops changing.
      const prev = document.documentElement.style.scrollBehavior
      document.documentElement.style.scrollBehavior = 'auto'
      const step = window.innerHeight * 0.7
      let last = -1
      for (let i = 0; i < 200; i++) {
        const target = window.scrollY + step
        window.scrollTo({ top: target, behavior: 'instant' })
        await new Promise(r => setTimeout(r, 260))
        if (window.scrollY === last) break          // hit the bottom
        last = window.scrollY
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
      document.documentElement.style.scrollBehavior = prev
      await new Promise(r => setTimeout(r, 900))    // let the 0.7s reveals finish
    })
    await p.waitForTimeout(1200)
    const unrevealed = await p.evaluate(() =>
      [...document.querySelectorAll('body *')].filter(e => +getComputedStyle(e).opacity === 0).length)
    if (unrevealed) console.log(`    (${name}: ${unrevealed} element(s) still at opacity:0 after scroll-through)`)

    const els=await p.evaluate(COLLECT)
    const full=`${OUT}/${TAG}-${name}.png`
    await p.screenshot({path:full, fullPage:true})

    // Backdrop pass. Glyphs go transparent, and any reveal/scroll animation is
    // frozen — otherwise the two passes disagree on where things are, and a
    // button label gets measured against the page instead of its own button.
    // Glyphs only. Do NOT disable animations: the homepage's intro veil is a
    // full-screen opaque overlay that animates away, and freezing it made the
    // backdrop pass photograph a white sheet over the whole page — which is
    // how a dark page reported "OneFlyer on rgb(255,254,254)".
    await p.addStyleTag({content:
      `*, *::before, *::after { color: transparent !important; text-shadow: none !important; }` +
      ` .intro-veil { display: none !important; }`})
    await p.waitForTimeout(900)
    const bpath=`${OUT}/.bg-${TAG}-${name}.png`
    await p.screenshot({path:bpath, fullPage:true})
    // Boxes re-read AFTER injection, from the same render the pixels came from.
    const boxes=await p.evaluate(()=>{
      // Union of every fixed/sticky overlay that actually paints. In a fullPage
      // screenshot Chromium renders fixed elements ONCE, over the top of the
      // page, so anything beneath an open overlay is photographed with the
      // overlay's pixels. That is how the open mobile menu made the hero's
      // reassurance line read as muted grey on the menu button's blue (1.15:1)
      // and the menu's own CTA read against the panel behind it.
      const overlays=[]
      for(const el of document.querySelectorAll('body *')){
        const c=getComputedStyle(el)
        if(c.position!=='fixed' && c.position!=='sticky') continue
        if(+c.opacity===0 || c.visibility==='hidden' || c.display==='none') continue
        if(c.backgroundColor==='rgba(0, 0, 0, 0)' && c.backgroundImage==='none') continue
        const r=el.getBoundingClientRect()
        if(r.width<4||r.height<4) continue
        overlays.push({el, x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height})
      }
      const m={}
      for(const el of document.querySelectorAll('[data-audit-id]')){
        const r=el.getBoundingClientRect()
        const b={x:r.x+window.scrollX,y:r.y+window.scrollY,w:r.width,h:r.height}
        b.occluded = overlays.some(o =>
          !o.el.contains(el) && !el.contains(o.el) &&
          b.x < o.x+o.w && b.x+b.w > o.x && b.y < o.y+o.h && b.y+b.h > o.y)
        m[el.getAttribute('data-audit-id')]=b
      }
      return m
    })
    const png=PNG.sync.read(fs.readFileSync(bpath))
    const px=(x,y)=>{const xi=Math.max(0,Math.min(png.width-1,Math.round(x))), yi=Math.max(0,Math.min(png.height-1,Math.round(y)))
      const i=(png.width*yi+xi)<<2; return {r:png.data[i],g:png.data[i+1],b:png.data[i+2]}}

    const fails=[], excluded=[]
    for(const e of els){
      const fg=parse(e.color); if(!fg) continue
      const bx=boxes[e.id]; if(!bx || bx.w<3 || bx.h<3) { excluded.push({...e, why:'no box'}); continue }
      // Measured, but not scored against AA — and named, never dropped.
      if(e.threeD){ excluded.push({...e, why:'3D-projected (rect != painted position)'}); continue }
      // Disabled controls only — WCAG 1.4.3 exempts inactive components.
      if(e.disabled){ excluded.push({...e, why:`disabled (WCAG-exempt)`}); continue }
      if(e.eff === 0){ excluded.push({...e, why:'opacity 0 (not painted)'}); continue }
      if(bx.occluded){ excluded.push({...e, why:'under a fixed overlay'}); continue }
      // Partial opacity is SCORED, not skipped. The backdrop pass already
      // photographed this element's own background dimmed by the same alpha,
      // so folding eff into the glyph's alpha reproduces exactly what is
      // painted. Excluding it instead would drop the faint decorative
      // numerals — real text a reader can see — out of the denominator.
      e.x=bx.x; e.y=bx.y; e.w=bx.w; e.h=bx.h
      // Average several points inside the element's own box on the backdrop pass.
      const pts=[]
      for(const fx of [0.15,0.4,0.6,0.85]) for(const fy of [0.35,0.65]) pts.push(px(e.x+e.w*fx, e.y+e.h*fy))
      const bg=pts.reduce((a,s)=>({r:a.r+s.r/pts.length,g:a.g+s.g/pts.length,b:a.b+s.b/pts.length}),{r:0,g:0,b:0})
      const cr=ratio(over({...fg, a: fg.a * e.eff}, bg), bg)
      grand.inspected++
      if(cr < e.need) { fails.push({...e, ratio:+cr.toFixed(2), bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`}); grand.failed++ }
    }
    fs.unlinkSync(bpath)
    grand.excluded += excluded.length
    report.push([name, els.length, fails.length, fails, excluded])
  } catch(err) { report.push([name,0,0,[{text:'ERROR: '+String(err.message).slice(0,70)}]]) }
  await ctx.close()
}
console.log(`\n  ==== ${THEME.toUpperCase()}-MODE CONTRAST AUDIT (${TAG}) — backdrop measured from rendered pixels ====\n`)
for(const [name,inspected,failed,fails,excluded=[]] of report){
  const scored = inspected - excluded.length
  console.log(`  ${name.padEnd(20)} found ${String(inspected).padStart(3)}   scored ${String(scored).padStart(3)}   failing ${String(failed).padStart(3)}   not-scorable ${String(excluded.length).padStart(2)}`)
  const seen=new Set()
  for(const f of fails.slice(0,40)){
    const k=(f.color||'')+(f.cls||'')+(f.text||''); if(seen.has(k))continue; seen.add(k)
    console.log(`        ${String(f.ratio??'').padStart(6)}:1 /${f.need??''}  ${String(f.color||'').padEnd(22)} on ${String(f.bg||'').padEnd(16)} "${f.text}"`)
    if(f.cls) console.log(`              <${f.tag} class="${f.cls}">`)
  }
  const byWhy={}
  for(const x of excluded) byWhy[x.why]=(byWhy[x.why]||0)+1
  for(const w in byWhy) console.log(`        not scorable: ${byWhy[w]} x ${w}`)
}
console.log(`\n  TOTAL scored ${grand.inspected}   TOTAL failing ${grand.failed}   TOTAL not-scorable ${grand.excluded}`)
await browser.close()
