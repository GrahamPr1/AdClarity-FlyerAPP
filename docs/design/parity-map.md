# Site redesign: feature inventory and parity map (Brief D, Step 0)

Status: **draft for approval**. Built from the code on `agent-platform` at
`0162743` (2026-11-13), not from memory.

> **The mockup files are not in the repo yet.** `docs/design/refresh-mockup/`
> (Main, Agents, Dashboard, Admin `.dc.html`) was never created: the files
> weren't in `~/Downloads`. The "New home" column below follows the structure
> the brief describes and is **provisional** until the mockup is in hand.
> Step 0 item 5 (the preview hero and header) waits for it.

Legend for **Change**: `same` = reached the same way, just restyled ·
`moved` = new location, old URL redirects or still works · `new` = new UI.
**Verified** is filled in during the build, one row at a time (role, landed URL).

---

## 1. Public pages

| Feature (route) | What it does today | New home | Change | Verified |
|---|---|---|---|---|
| Homepage `/` | Hero (3D flyer, CTA), sections: what-you-get, how-it-works, see-it (sample gallery + interactive campaign demo), pricing (monthly/annual switch), use-cases, FAQ, footer | Main mockup: sticky header, hero + B2C video slot, "Run a team of agents?" card, five-outputs, how-it-works, Agents band, pricing | restyled | |
| ↳ Sample gallery (real output) | Real generated examples | **Not in the brief's mockup description.** Proposed: keep as a "See real output" section after five-outputs | moved | |
| ↳ Interactive campaign demo | Visitor types a business and offer, sees the shape of a campaign | **Not described.** Proposed: keep, under how-it-works ("Try it") | moved | |
| ↳ Use cases | Industry examples | **Not described.** Proposed: keep, compact, before pricing | moved | |
| ↳ FAQ | Full answers (also the target of `/faq`) | **Not described.** Proposed: keep, after pricing; `/faq` redirect unchanged | moved | |
| ↳ Pricing + Monthly/Annual switch | `PricingCards` from `lib/plans.ts`, "Save N%", renewal disclosure, checkout switch (`CHECKOUT_ENABLED`) | Pricing section | restyled | |
| ↳ Header "Agents / Agentes" → `/agent` | NOP agent portal front door | Header, kept exactly (desktop row and phone menu) | same | |
| ↳ Account links (signed in) | `FooterAccountLinks`, `account-menu` | Header and footer | same | |
| `/about`, `/contact` (+ contact form → `/api/contact`) | Company page, contact form | Restyled with new tokens | same | |
| `/privacy`, `/terms`, `/refund-policy` | Legal pages | Restyled; text unchanged | same | |
| `/coloring-page` | Free coloring-page maker with its own intake form | Restyled | same | |
| `/r/[code]` offer page + lead form, `/r/[code]` not-found | What a flyer QR opens; lead capture by plan | **Customer-facing, branded by the business.** Proposed: keep its current look (it's the client's page, not ours) | same | |
| `/unsubscribe` | Email preference landing | Restyled | same | |
| `/checkout` (route) | Starts Stripe checkout for a plan | Unchanged behaviour | same | |
| `/faq`, `/pricing` and other vanity redirects (`next.config.mjs`) | Permanent redirects to homepage sections | Same targets (section ids kept) | same | |
| 404 / error | **No site-wide `not-found` or `error` page exists today** (only `/r/[code]`) | Proposed **new**: `app/not-found.tsx` in the new design. NOP routes render through it too, so it must not change any NOP page that calls `notFound()` | new (flag) | |
| **OneFlyer for Agents** (B2B) | Doesn't exist | **`/for-agents`** (see §5) | new | |

## 2. Auth

| Feature | Today | New home | Change | Verified |
|---|---|---|---|---|
| `/login`: client sign-in, sign-up mode, forgot-password mode, "Site admin? Sign in with password" | One page, several modes; **contains NOP sections** (EN/ES strings, `?lang`, NOP agent redirect) | **Proposed: leave its look unchanged in Brief D**, because it's listed in NOP_FROZEN §3 and NOP agents use it. Alternative: restyle only the non-NOP render path, with NOP before/after screenshots | same (flag) | |
| `/reset-password` | Reset form; NOP section per NOP_FROZEN §3 | As `/login` | same (flag) | |
| `/api/auth/*` (login, client-login, signup, logout, forgot/reset, session) | | Unchanged | same | |

## 3. SMB client app

| Feature | Today (component) | New home (Dashboard mockup: navy sidebar) | Change | Verified |
|---|---|---|---|---|
| Dashboard `/dashboard` "Your campaigns" | `dashboard-client` (one long page) | Sidebar: **Campaigns** | moved into sidebar layout | |
| AI Control Center journey strip | `journey-control-center`, `ai-control-center` | Top of Campaigns | same | |
| First-campaign empty state, "Building your campaign…" | `dashboard-client` | Campaigns empty and loading states | same | |
| Flyers & Pages grid, "Other flyers" | `dashboard-client` | Campaigns | same | |
| Direct field editing + undo | `flyer-edit-panel` | Flyer detail (drawer or panel) | same | |
| Download menu (PDF/PNG/social), PDF export `/api/flyers/[id]/pdf` | `download-menu` | Flyer detail and card actions | same | |
| Print on own printer | `print-button` | Flyer actions | same | |
| Print requests | `dashboard-client` "Print Requests" | Sidebar: **Print requests** (or Campaigns subsection) | moved | |
| New promotion from a flyer (Pro) | `new-promotion-form`, `offer-refresh-banner` | Flyer actions | same | |
| Offer page editor `/dashboard/offer/[flyerId]` | `offer-page-editor`, `offer-page-card` | Sidebar → Campaigns → flyer → Offer page | same URL | |
| Leads list (+ delete) | `leads-list`, `/api/account/leads` | Sidebar: **Leads** | moved | |
| QR tracking, channels, analytics | `/api/tracking/*`, channel naming in `dashboard-client` | Sidebar: **Results** (or Campaigns stats) | moved | |
| Form-fill section | `form-fill-section` | Sidebar: **Forms** (proposed) | moved | |
| Email delivery notice (bounced lead emails) | `email-delivery-notice` | Banner at top of every app screen | same | |
| Business details card | `business-details-card` | Sidebar: **Business** (with profile) | moved | |
| Create a campaign `/onboarding` | `create-flyer-flow`: modes **scan** (business scanner, `business-scan-flow`, `scanned-pages-panel`, `logo-preview`), **guided** (`guided-setup-flow`, `onboarding-form`), **product** (`product-campaign-flow`), **quick** (`quick-prompt-form`); goal campaigns (`/api/goal-campaign/*`); multi-flyer generation (`campaign-flow`) | Primary "New campaign" button in the sidebar header; same flow, restyled | same URL | |
| Profile `/profile` | `BusinessProfileForm`, `CampaignDefaultsForm`, `EmailSettings`, `ThemeSetting` (dark mode), `AccountStatus` (pause/resume) | Sidebar: **Settings** (Business profile · Campaign defaults · Email · Appearance · Account) | same URL | |
| Products | `/api/products` (used by the product flow) | Inside Create campaign → product, plus Business | same | |
| Billing: plan, upgrade, Stripe portal | `/api/stripe/portal`, `/checkout`, `/api/billing/checkout-result`, plan limits (`PLAN_LIMITS`) | Sidebar: **Plan & billing** | moved | |
| Dark-mode toggle | `theme-setting` on `/profile`; `theme-provider` | Settings → Appearance, plus a quick toggle in the sidebar footer (proposed) | same + new shortcut | |
| Account menu, sign out | `account-menu` | Sidebar footer | moved | |

## 4. Admin, agent platform, other

| Feature | Today | New home (Admin mockup: navy sidebar) | Change | Verified |
|---|---|---|---|---|
| `/admin` landing: billing overview, links | `admin/billing-overview`, link list (incl. the new Organizations link) | Sidebar: **Overview** | moved | |
| Users `/admin/users`, `/admin/users/[email]` (set plan, set admin) | | Sidebar: **Users** | same URLs | |
| Billing members, activity, audit `/admin/billing/*` | | Sidebar: **Billing** (Members · Activity · Audit) | same URLs | |
| AI costs `/admin/costs` | | Sidebar: **Costs** | same | |
| Test-data audit `/admin/audit` (GET, DELETE) | | Sidebar: **Audit** | same | |
| Waitlist `/admin/waitlist` (+ notify) | | Sidebar: **Waitlist** | same | |
| Enterprise demo `/admin/enterprise-demo` | | Sidebar: **Enterprise demo** | same | |
| Leads admin, clients API (`/api/admin/leads`, `/clients`) | Used by admin views | Under Users | same | |
| **Organizations** `/admin/organizations` (+ `[id]`) | Agent platform admin | Sidebar: **Organizations** (top-level, per brief) | moved into sidebar | |
| NOP admin `/admin/enterprise/nop`, `/admin/enterprise/agents/*` | **Frozen** | Sidebar link to it ("NOP agents"), page itself untouched and rendered outside the new layout | link only | |
| Agent platform portal `/ap/[org]`, `/join`, `/sign-in` | Platform agent pages | Restyled in step E | same URLs | |
| Pro free trial (owner only) | `admin-pro-trial` (a NOP-section shared file) | Untouched | same | |
| Emails: password reset, contact, lead notification, waitlist, operational alert, platform sign-in code; NOP emails (frozen) | `lib/email.ts`, `lib/ap/email.ts` | **Not part of the visual redesign.** Proposed: unchanged in Brief D | same | |
| Crons (`public-emails`, 4× NOP) | `vercel.json` | Unchanged | same | |
| Analytics: GA4, GTM, Vercel Analytics, conversion events | `google-analytics`, `google-tag-manager`, `vercel-analytics`, `conversion-events` | Unchanged; new GA4 events added in step G | same | |
| Intro animation | `intro-animation` | **Not described.** Proposed: drop on the new homepage only if the mockup has none (flag; it's a homepage-only effect) | flag | |

---

## 5. Route for the Agents page: `/for-agents`

- Doesn't exist today, isn't in NOP_FROZEN (`/agent/**`, `/agente` are NOP's),
  isn't in the middleware matcher, and can't collide with platform org slugs
  (those live under `/ap/`).
- **Two "agent" links will exist side by side:** "Agents / Agentes" (NOP's
  agent sign-in, kept exactly) and "OneFlyer for Agents" (the B2B page). The
  proposal is to keep the header link exactly as it is and reach `/for-agents`
  from the hero card and the navy band, so the two are never confused.

## 6. How NOP stays pixel-identical

NOP shares the root layout, the global stylesheet and its tokens. Measured
across NOP's pages and components: `text-muted-foreground` ×206,
`border-border` ×171, `bg-card` ×65, `var(--brand-teal-bright)` ×59,
`text-foreground` ×31, `bg-background` ×29, `--primary-foreground` ×23,
`--surface-soft` ×20, `--surface-sunken` ×11, `--brand-teal` ×9, plus the
global h1–h3 DM Serif rule. Changing any of those in place would change NOP.

**Rules for the redesign:**
1. `app/globals.css` `:root` / `.dark` tokens and its element rules are **not
   edited**. `app/layout.tsx` (fonts, providers) is **not edited**. DM Sans
   and DM Serif Display are already loaded there and are reused.
2. New tokens live in a new stylesheet (`styles/refresh.css`), every variable
   prefixed `--rf-*` and defined only under `[data-design="refresh"]` (light)
   and `.dark [data-design="refresh"]` (dark). Only the new layouts set that
   attribute, so no NOP page can match.
3. New components go in `components/refresh/*`. `components/ui/*` and every
   existing shared component are not edited; where a restyled screen needs a
   variant, it gets a new component.
4. Shared files with NOP sections (NOP_FROZEN §3: `middleware.ts`, `/login`,
   `/reset-password`, `/privacy`, `mobile-nav`, `admin-pro-trial`): the NOP
   parts aren't touched. `/login` and `/reset-password` keep their current
   look in Brief D unless you decide otherwise (see §2).
5. **Proof:** Playwright screenshots of NOP pages before and after each build
   step, EN and ES, light and dark, at 390px and 1440px, compared pixel for
   pixel:
   - signed out on staging (`/agent/start`, `/agent/sign-in`, `/agente`,
     `/program`, a `/p/` and `/e/` not-found)
   - signed in locally against the dev Redis with
     `scripts/seed-enterprise-demo.ts` (staging has no NOP data)

## 7. Decisions needed

1. **Annual prices.** The brief says Basic $15.20/mo billed $182.40/yr and Pro
   $31.20/mo billed $374.40/yr (20% off). The real Stripe sandbox prices
   (checked read-only) and `lib/plans.ts` are **$180/yr** and **$360/yr**
   ($15.00 and $30.00 a month, 21% and 23% off). The page reads from config,
   so it will show $180 and $360 unless new Stripe prices are created and the
   config updated. Recommendation: keep $180 and $360.
2. Homes for the sections the mockup description doesn't show: sample
   gallery, campaign demo, use cases, FAQ, intro animation (§1, §4).
3. `/login` and `/reset-password`: leave as they are (recommended) or restyle
   the non-NOP path only.
4. A new site-wide 404 page: yes or no.
5. The mockup files themselves.
