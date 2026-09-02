// ---------------------------------------------------------------------------
// Landing-page marketing content — one source of truth for copy that appears
// in more than one place (CTAs especially), so the funnel can't drift into
// five differently-worded buttons.
//
// HONESTY BOUNDARY — read before adding anything here.
// Everything claimed on the landing page must map to something the app
// actually does today. What the pipeline really produces per submission
// (see RepurposedFlyerContent in lib/types.ts and the repurposing section of
// lib/agent-pipeline/prompts/flyer.ts):
//
//   REAL: the flyer itself · a separate square Instagram post + caption ·
//         a text-blast blurb · a Nextdoor post · a QR code on the flyer
//         pointing at a hosted /r/[code] page · QR scan + CTA click counts ·
//         print requests (a real queue an admin fulfills, not automated
//         printing) · a saved business profile that auto-fills forms (Pro) ·
//         a saved brand profile reused by Quick Prompt
//
//   NOT REAL — do not claim: a Facebook post (only Instagram is generated as
//         a designed asset) · "shares"/"views"/"leads" metrics (only scans
//         and clicks are counted) · a dedicated referral-marketing system
//         (a client can ASK for a referral card as their promotion — see
//         lib/quick-prompt-starters.ts — but nothing tracks referral chains) ·
//         real card checkout (no Stripe integration exists yet) ·
//         testimonials, customer counts, awards, or press
//
// Multi-channel output (Instagram/text/Nextdoor), QR tracking, and print
// requests are Basic+ — a real server-side gate, not just hidden UI (see
// getPlanFeatures in lib/agent-pipeline/pipeline.ts). Trial gets the flyer.
// Any section that leads with "one promotion, everything" has to say so.
// ---------------------------------------------------------------------------

import { PLAN_LIMITS } from "./types"

/** Where "contact us" actually goes. One constant so the footer, the help links, and the in-app request form can't drift apart. */
export const SUPPORT_EMAIL = "Gpearl1006@gmail.com"

/* ------------------------------- CTA system ------------------------------- */

// Sends them to onboarding on the free tier. middleware.ts intercepts an
// unauthenticated visit and redirects to /login?next=<this>, so a brand-new
// visitor gets signup-then-straight-into-onboarding with no extra landing
// page in between, and app/onboarding/page.tsx applies the trial plan on
// arrival. One href for the whole funnel.
export const PRIMARY_CTA_HREF = "/onboarding?plan=trial"
export const PRIMARY_CTA_LABEL = "Create My First Campaign — Free"
/** Shorter variant for tight spots (nav, mobile) where the full label wraps badly. */
export const PRIMARY_CTA_LABEL_SHORT = "Try OneFlyer Free"
export const SECONDARY_CTA_LABEL = "See How It Works"
export const SECONDARY_CTA_HREF = "#how-it-works"

/** Sits under the primary CTA. Every clause here is literally true today. */
export const CTA_REASSURANCE = `${PLAN_LIMITS.trial} campaigns free • No credit card required`

/**
 * Sits with the signup CTA. Every clause is something the Privacy Policy
 * actually commits to (see app/privacy/page.tsx) — no badge imagery, no
 * invented certification, nothing that would need a lawyer to defend.
 */
export const DATA_ASSURANCE = "We never sell your business details, and you own every flyer you generate."

/**
 * The compact hesitation-killer row under the hero. Deliberately three short
 * claims that are each verifiable: there is no design step in the product,
 * generation really is a single sitting, and the trial really takes no card.
 */
export const MICRO_TRUST = [
  "No design experience required",
  "Create in minutes",
  "Start free — no card",
]

/* --------------------------------- Nav ----------------------------------- */

export const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#what-you-get" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

/* ------------------------------- Use cases -------------------------------- */
//
// The example promotions are illustrative of what a client might ASK for —
// they're prompts, not claims about results. Kept concrete because a roofer
// scanning this page should recognize their own business in it.

export interface UseCase {
  trade: string
  promo: string
}

export const USE_CASES: UseCase[] = [
  { trade: "Roofing", promo: "$500 Off Your New Roof" },
  { trade: "HVAC", promo: "Free AC Inspection" },
  { trade: "Plumbing", promo: "$99 Drain Cleaning" },
  { trade: "Remodeling", promo: "Free Kitchen Design Consult" },
  { trade: "Landscaping", promo: "Spring Cleanup — $100 Off" },
  { trade: "Cleaning", promo: "First Clean 50% Off" },
  { trade: "Real Estate", promo: "Just Listed — Open House Sunday" },
  { trade: "Auto Detailing", promo: "Full Detail — $149" },
  { trade: "Salons & Barbers", promo: "New Client Cut — $20" },
  { trade: "Restaurants", promo: "Two Entrées, One Price — Tuesdays" },
  { trade: "Fitness", promo: "First Month Free" },
  { trade: "Local Services", promo: "Whatever you're promoting this month" },
]

/* ------------------------- What one submission makes ---------------------- */
//
// Exactly the four assets the pipeline really returns, plus the QR that goes
// ON the flyer. Deliberately no Facebook post — nothing generates one.

export interface CampaignAsset {
  key: "flyer" | "instagram" | "text" | "nextdoor" | "qr"
  label: string
  blurb: string
  /** True when Trial includes it — everything else is a real Basic+ gate. */
  onTrial: boolean
}

export const CAMPAIGN_ASSETS: CampaignAsset[] = [
  { key: "flyer", label: "Print flyer", blurb: "A designed, brand-matched flyer you can print or hand out.", onTrial: true },
  { key: "qr", label: "Trackable QR code", blurb: "Printed on the flyer, pointing to your own offer page.", onTrial: false },
  { key: "instagram", label: "Instagram post", blurb: "A square version, redesigned for the feed — plus a caption.", onTrial: false },
  { key: "text", label: "Text-blast message", blurb: "Short copy ready to paste into a text to your customer list.", onTrial: false },
  { key: "nextdoor", label: "Nextdoor post", blurb: "Neighborhood-appropriate wording for local reach.", onTrial: false },
]

/* ------------------------------ Manual vs us ------------------------------ */

export const COMPARISON: { task: string; oneflyer: string; diy: string }[] = [
  { task: "Designing the flyer", oneflyer: "Generated for you", diy: "Hours in a design tool" },
  { task: "Writing the copy", oneflyer: "Written for you", diy: "Blank page every time" },
  { task: "Instagram version", oneflyer: "Redesigned for the feed", diy: "Resize and rebuild it" },
  { task: "Text + Nextdoor wording", oneflyer: "Written to fit each one", diy: "Rewrite it three ways" },
  { task: "QR code", oneflyer: "On the flyer, and tracked", diy: "A separate tool" },
  { task: "Your brand details", oneflyer: "Saved and reused", diy: "Re-enter them every time" },
  { task: "Knowing if it worked", oneflyer: "Scans and clicks counted", diy: "Mostly guessing" },
]

/* ------------------------------- Objections ------------------------------- */
//
// The two things a local business owner actually thinks before signing up.
// Both answers explain a difference in job-to-be-done rather than attacking
// the alternative — partly because that's more persuasive, and partly because
// "Canva is worse" isn't true and wouldn't survive contact with a visitor who
// already likes Canva.

export const OBJECTIONS: { heading: string; lead: string; body: string; points: string[] }[] = [
  {
    heading: "Canva makes designs. OneFlyer builds the campaign.",
    lead: "Canva is genuinely great at designing one graphic at a time.",
    body: "That's a different job. OneFlyer starts from the promotion itself and produces the pieces you need to actually get it in front of people — the flyer, the square post, the text, the neighborhood post, and a QR code that ties back to you.",
    points: [
      "You start with an offer, not a blank canvas",
      "The copy is written, not just the layout",
      "Every piece is already consistent with the others",
    ],
  },
  {
    heading: "ChatGPT writes the words. It doesn't hand you the campaign.",
    lead: "You can absolutely get good copy out of a chatbot — and then you still have to design the flyer, size a square version, make a QR code somewhere else, and keep your phone number and colors identical across all of it.",
    body: "OneFlyer is the assembled version: the writing and the designed, on-brand pieces come back together, already consistent, with the QR code placed on the flyer.",
    points: [
      "Designed pieces, not just text to paste somewhere",
      "Your brand details applied automatically",
      "One place instead of four tabs",
    ],
  },
]

/* --------------------------------- Trust ---------------------------------- */
//
// Deliberately NOT social proof. There are no customers to quote, no counts to
// cite, and no awards — so this section earns trust the only honest way
// available right now: by being specific about limits and pricing. If real
// testimonials ever exist, they belong here and these can move or shrink.

export const TRUST_POINTS: { title: string; body: string }[] = [
  {
    title: "You saw the real output",
    body: "The previews on this page are the actual set of pieces a campaign produces — not a mockup of a product roadmap.",
  },
  {
    title: "Clear about what it doesn't do",
    body: "We list which channels are generated and which plan includes them, rather than leaving you to find the edges after paying.",
  },
  {
    title: "Transparent pricing",
    body: "Three plans, published limits, no sales call. The free tier is genuinely free and takes no card.",
  },
  {
    title: "Your work stays yours",
    body: "Every flyer you generate is yours to download, print, and reuse — including if you stop subscribing.",
  },
]

/* ---------------------------------- FAQ ---------------------------------- */
//
// Every answer here is checked against real behavior. Where a capability is
// narrower than a visitor might assume (printing is a request queue, not a
// press; tracking counts two things, not five), the answer says so plainly
// rather than letting the shorter version imply more.

export const FAQS: { q: string; a: string }[] = [
  {
    q: "What file do I actually get, and how do I print it?",
    a: "Each flyer is a self-contained HTML file. From your dashboard you can hit Print to send it straight to your own printer, or choose \u201cSave as PDF\u201d in the same print dialog if you need a PDF to email or take to a print shop \u2014 no separate export step. It prints at the real size of whatever you made: a flyer or one-pager on letter paper, a door hanger at 3.5 by 8.5 inches, a long proposal across two pages. You can also download the HTML file itself and open it in any browser. There is no direct PDF download button; the print dialog is how you get one.",
  },
  {
    q: "What is OneFlyer?",
    a: "You tell OneFlyer about your business and what you're promoting. It designs a professional flyer matched to your brand — and on Basic and Pro, it also gives you a matching Instagram post, a text-blast message, a Nextdoor post, and a trackable QR code printed on the flyer. One promotion in, a set of marketing materials out.",
  },
  {
    q: "Do I need design experience?",
    a: "No. There's nothing to lay out, drag, or resize. You answer a few questions about your business and your offer — or let OneFlyer read your existing website and fill most of it in for you — and the design happens automatically.",
  },
  {
    q: "How long does a campaign take to create?",
    a: "Minutes. Onboarding is a short form (or a website scan that pre-fills it), and your flyer appears in your dashboard as soon as it's generated. You can watch its status while it builds.",
  },
  {
    q: "Do I have to re-enter my business details every time?",
    a: "No. After your first campaign you can save a business profile, and from then on it fills itself in — years in business, brand colours, preferred style, voice and tone, contact name, website, address and social handles all carry across automatically. On a second or third campaign you're left with just the two things that actually change: what you're promoting and who you're promoting it to. That's on every plan, including the free tier.",
  },
  {
    q: "Can I use my own logo, colors, and branding?",
    a: "Yes. You can enter your brand colors and details directly, or point OneFlyer at your website and it will pull your logo, colors, and business info automatically for you to review. Your brand is then saved and reused, so later campaigns stay consistent without re-entering anything.",
  },
  {
    q: "What social media content do I get?",
    a: "On Basic and Pro, every flyer comes with a separately designed square Instagram post plus a caption, a short text-blast blurb, and a Nextdoor post. Those are the channels OneFlyer generates today — it does not currently produce a separate Facebook design, though the Instagram image and caption work fine posted to Facebook.",
  },
  {
    q: "Can I get the flyers printed?",
    a: "Two ways. Print it yourself straight from your dashboard — the Print button sends it to your printer at its real size, or saves it as a PDF through the same dialog, with no design software needed. On Basic and Pro you can also request printed copies from your dashboard: you tell us the quantity and where to ship them, and we email you a quote covering price and turnaround before anything is printed or charged. Printing is not included in your subscription and is never charged automatically — it is a real request we fulfil by hand, so pricing depends on quantity, paper and destination.",
  },
  {
    q: "Can I track QR code scans?",
    a: "Yes, on Basic and Pro. Every flyer gets a unique QR code pointing to a hosted offer page, and your dashboard shows two real numbers: how many times that page was opened (scans) and how many people tapped the call-to-action on it (clicks). It doesn't track shares, impressions, or attribute closed jobs.",
  },
  {
    q: "What happens to my QR codes if I cancel or pause?",
    a: "They keep working. A QR code you've already printed stays pointed at its offer page permanently — cancelling does not switch it off, because a flyer that goes dead in someone's mailbox would be your problem, not ours to create. Scans and clicks keep being counted, and the numbers you've already collected stay in your dashboard. What stops is making NEW campaigns: those need an active plan, or your free-tier allowance.",
  },
  {
    q: "Is there a free trial?",
    a: `Yes — ${PLAN_LIMITS.trial} campaigns free, no credit card required. The free tier includes the flyer itself and the AI design engine. QR tracking, the Instagram/text/Nextdoor versions, and print requests start on Basic.`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Basic and Pro are month-to-month with no contract, and every flyer you've already made stays yours to download and use whether or not you keep subscribing. If you just need a break rather than an exit, you can pause instead — pausing stops your plan without deleting your account, your brand profile, or your flyer history, so resuming later doesn't mean starting over.",
  },
  {
    q: "Who is OneFlyer for?",
    a: "Local businesses that need to promote something and don't have a marketing department — roofers, HVAC and plumbing companies, remodelers, landscapers, cleaners, detailers, realtors, salons, restaurants, and small service businesses.",
  },
]

/* ------------------------------ Demo campaign ----------------------------- */
//
// The example business used in the hero and showcase. Fictional and labeled
// as an example everywhere it appears — it is NOT a customer.

export const DEMO_BUSINESS = "Bluegrass Roofing"
export const DEMO_PROMO = "$500 Off Your New Roof"
export const DEMO_TRADE = "Roofing"
