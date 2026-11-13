# Agent platform flyer slots (proposal, pending approval)

Every Basic Benefits-specific element of the copied kit-v2 body becomes a per-org slot. Layout, design system, fonts, colours, icons and the agent footer stay fixed.

Budgets: `max(supplied EN, ES length) × 1.1`, rounded up to 5 (short slots: supplied + 3). Over-budget input is rejected on save. The budget is necessary but not sufficient: every save also renders the page and the **measured** fit gates (below) must pass, slot by slot. **Max lines** = the line count the supplied Basic Benefits text renders at, measured from the originals and pinned in a table; a slot that wraps beyond it is rejected.

## P1 — three benefits + “easy to use” steps (37 slots)

| Slot | Budget (chars) | Supplied EN / ES | Example (supplied, EN) |
|---|---|---|---|
| `header.programTag` | 35 (1 line) | 29 / 29 | Neighborhood Outreach Program |
| `header.packageLabel` | 16 (1 line) | 9 / 9 | Package 1 |
| `header.titleLine1` | 18 (1 line) | 8 / 8 | Everyday |
| `header.titleLine2` | 18 (1 line) | 5 / 7 | care. |
| `header.subtitle` | 90 | 79 / 80 | Convenient virtual care, prescription savings… |
| `price.label` | 25 (1 line) | 20 / 14 | Monthly member price |
| `price.1.amount` | `$`+1–4 digits | 3 / 3 | $36 |
| `price.1.label` | 14 (1 line) | 6 / 10 | Single |
| `price.2.amount` | `$`+1–4 digits | 3 / 3 | $45 |
| `price.2.label` | 14 (1 line) | 6 / 8 | Family |
| `included.label` | 20 (1 line) | 15 / 11 | What's included |
| `included.line1` | 24 (1 line) | 15 / 16 | Three benefits, |
| `included.line2` | 24 (1 line) | 15 / 14 | one membership. |
| `card1.title` | 40 | 24 / 33 | 24/7 Virtual Urgent Care |
| `card1.description` | 110 | 87 / 99 | Convenient access to board-certified physicia… |
| `card1.bullet1` | 35 | 24 / 29 | $0 copay for every visit |
| `card1.bullet2` | 40 | 27 / 36 | Phone or video visits, 24/7 |
| `card1.bullet3` | 95 | 56 / 84 | Treatment for cold/flu, allergies, rashes, UT… |
| `card1.bullet4` | 60 | 51 / 53 | Electronic prescriptions when medically appro… |
| `card2.title` | 35 | 17 / 29 | Urgent Rx Benefit |
| `card2.description` | 115 | 83 / 100 | Save on eligible formulary medications used f… |
| `card2.bullet1` | 50 | 45 / 45 | Many eligible prescriptions at $0 member cost |
| `card2.bullet2` | 65 | 55 / 48 | Program contributes up to $30 per eligible pr… |
| `card2.bullet3` | 85 | 66 / 75 | If the cost is higher, you pay only the amoun… |
| `card3.title` | 35 | 17 / 30 | Lifestyle Savings |
| `card3.description` | 105 | 85 / 92 | BenefitHub gives members discounts and cash-b… |
| `card3.bullet1` | 55 | 45 / 47 | Travel, hotels, restaurants and entertainment |
| `card3.bullet2` | 75 | 53 / 64 | Apparel, electronics, fitness, auto and home … |
| `card3.bullet3` | 80 | 53 / 70 | Gift cards, local deals and eligible cash-bac… |
| `steps.label` | 16 (1 line) | 11 / 13 | Easy to use |
| `steps.1` | 100 | 77 / 88 | Use your member portal or benefit access link… |
| `steps.2` | 85 | 75 / 73 | Present your NOP member ID card at the pharma… |
| `steps.3` | 95 | 78 / 82 | Sign in to BenefitHub to browse discounts, of… |
| `disclaimer` | 230 | 156 / 209 | Membership benefits are subject to program te… |
| `footer.programLine` | org setting (40) | 29 / 29 | Neighborhood Outreach Program |
| `footer.taglineLine` | org setting (40) | 24 / 35 | Sign in or enroll online |
| `footer.versionStamp` | generated | 19 / 19 | NOP-P1-EN · 10/2026 |

## P2 — four benefits + “plus” card (43 slots)

| Slot | Budget (chars) | Supplied EN / ES | Example (supplied, EN) |
|---|---|---|---|
| `header.programTag` | 35 (1 line) | 29 / 29 | Neighborhood Outreach Program |
| `header.packageLabel` | 16 (1 line) | 9 / 9 | Package 2 |
| `header.titleLine1` | 18 (1 line) | 8 / 8 | Complete |
| `header.titleLine2` | 18 (1 line) | 13 / 17 | virtual care. |
| `header.subtitle` | 100 | 89 / 79 | A more complete virtual healthcare experience… |
| `price.label` | 25 (1 line) | 20 / 14 | Monthly member price |
| `price.1.amount` | `$`+1–4 digits | 4 / 4 | $118 |
| `price.1.label` | 14 (1 line) | 6 / 10 | Single |
| `price.2.amount` | `$`+1–4 digits | 4 / 4 | $151 |
| `price.2.label` | 14 (1 line) | 6 / 8 | Family |
| `included.label` | 20 (1 line) | 15 / 11 | What's included |
| `included.line1` | 24 (1 line) | 18 / 18 | Whole-person care, |
| `included.line2` | 24 (1 line) | 12 / 13 | all virtual. |
| `card1.title` | 30 | 20 / 25 | Virtual Primary Care |
| `card1.description` | 135 | 112 / 122 | An ongoing relationship with a virtual primar… |
| `card1.bullet1` | 35 | 24 / 29 | $0 copay for every visit |
| `card1.bullet2` | 40 | 29 / 36 | Wellness and follow-up visits |
| `card1.bullet3` | 45 | 32 / 40 | Medication and care-plan support |
| `card1.bullet4` | 45 | 29 / 39 | Integrated urgent care access |
| `card2.title` | 40 | 24 / 33 | 24/7 Virtual Urgent Care |
| `card2.description` | 90 | 81 / 68 | On-demand care for common, non-emergency illn… |
| `card2.bullet1` | 35 | 24 / 29 | $0 copay for every visit |
| `card2.bullet2` | 30 | 26 / 20 | Board-certified physicians |
| `card2.bullet3` | 35 | 22 / 30 | Phone and video visits |
| `card2.bullet4` | 50 | 41 / 41 | Electronic prescriptions when appropriate |
| `card3.title` | 30 | 25 / 20 | Virtual Behavioral Health |
| `card3.description` | 70 | 62 / 63 | Convenient virtual support for mental and emo… |
| `card3.bullet1` | 30 | 25 / 27 | $0 copay where applicable |
| `card3.bullet2` | 40 | 32 / 32 | Therapy and counseling resources |
| `card3.bullet3` | 55 | 46 / 48 | Psychiatry and medication-management resources |
| `card3.bullet4` | 65 | 55 / 51 | Support for anxiety, depression, stress, slee… |
| `card4.title` | 30 | 19 / 27 | Urgent + Chronic Rx |
| `card4.description` | 85 | 77 / 76 | Expanded prescription savings for eligible ac… |
| `card4.bullet1` | 75 | 47 / 65 | Many eligible formulary drugs at $0 member cost |
| `card4.bullet2` | 60 | 53 / 52 | Up to $30 program allowance per eligible pres… |
| `card4.bullet3` | 80 | 60 / 69 | You pay only the amount above the allowance, … |
| `plus.label` | 8 (1 line) | 4 / 6 | Plus |
| `plus.title` | 50 | 28 / 41 | BenefitHub Lifestyle Savings |
| `plus.description` | 160 | 144 / 145 | Thousands of special offers, discounts and ca… |
| `disclaimer` | 225 | 201 / 196 | Membership benefits are subject to program te… |
| `footer.programLine` | org setting (40) | 29 / 29 | Neighborhood Outreach Program |
| `footer.taglineLine` | org setting (40) | 24 / 35 | Sign in or enroll online |
| `footer.versionStamp` | generated | 19 / 19 | NOP-P2-EN · 10/2026 |

## P3 — two benefits + engagement card (35 slots)

| Slot | Budget (chars) | Supplied EN / ES | Example (supplied, EN) |
|---|---|---|---|
| `header.programTag` | 35 (1 line) | 29 / 29 | Neighborhood Outreach Program |
| `header.packageLabel` | 16 (1 line) | 9 / 9 | Package 3 |
| `header.titleLine1` | 18 (1 line) | 15 / 15 | Health & weight |
| `header.titleLine2` | 18 (1 line) | 11 / 8 | management. |
| `header.subtitle` | 150 | 111 / 134 | A member-focused wellness and weight-manageme… |
| `price.label` | 25 (1 line) | 20 / 14 | Monthly member price |
| `price.1.amount` | `$`+1–4 digits | 4 / 4 | $100 |
| `price.1.label` | 14 (1 line) | 11 / 12 | Member only |
| `included.label` | 20 (1 line) | 15 / 11 | What's included |
| `included.line1` | 24 (1 line) | 21 / 20 | Guidance and support, |
| `included.line2` | 24 (1 line) | 13 / 17 | in one place. |
| `card1.title` | 35 | 21 / 28 | Healthyr Wellness Hub |
| `card1.description` | 130 | 92 / 117 | A digital wellness hub that helps members tur… |
| `card1.bullet1` | 55 | 41 / 46 | Personalized health and wellness guidance |
| `card1.bullet2` | 35 | 29 / 30 | Nutrition and fitness support |
| `card1.bullet3` | 45 | 40 / 35 | Health assessments and progress tracking |
| `card1.bullet4` | 50 | 42 / 42 | Medication reminders and adherence support |
| `card1.bullet5` | 75 | 55 / 67 | Virtual vitals and body-composition tools, wh… |
| `card1.bullet6` | 60 | 44 / 52 | SCOUT smart companion for next-step guidance |
| `card2.title` | 30 | 25 / 23 | GLP-1 & Weight Management |
| `card2.description` | 115 | 93 / 101 | A modern weight-management membership support… |
| `card2.bullet1` | 45 | 39 / 40 | Weight-management resources and support |
| `card2.bullet2` | 85 | 62 / 73 | Access to GLP-1 medication options when clini… |
| `card2.bullet3` | 75 | 68 / 68 | Program eligibility and medication availabili… |
| `card2.bullet4` | 95 | 72 / 82 | Medication pricing may vary and is separate u… |
| `engage.line1` | 25 (1 line) | 20 / 22 | Designed to help you |
| `engage.line2` | 25 (1 line) | 13 / 23 | stay engaged. |
| `engage.paragraph` | 195 | 175 / 156 | Digital wellness guidance and weight-manageme… |
| `engage.bullet1` | 65 | 51 / 57 | Build healthier routines with personalized gu… |
| `engage.bullet2` | 60 | 47 / 51 | Track progress and stay connected to your goals |
| `engage.bullet3` | 85 | 64 / 73 | One member-focused experience for your weight… |
| `disclaimer` | 255 | 199 / 228 | Package 3 is a wellness and weight-management… |
| `footer.programLine` | org setting (40) | 29 / 29 | Neighborhood Outreach Program |
| `footer.taglineLine` | org setting (40) | 24 / 35 | Sign in or enroll online |
| `footer.versionStamp` | generated | 19 / 19 | NOP-P3-EN · 10/2026 |


## Logo slot (all layouts)

- Fixed box in the header's top-left: **200 × 40 CSS px** (2.08 × 0.42 in). Basic Benefits' logo renders 155 × 40 px in the same place. `object-fit: contain`, `object-position: left center`, so the logo is never cropped or stretched.
- Header background is navy `#000836`, so the logo must read on dark. **PNG only, with transparency** (a JPEG would print its own background box). ≤ 1 MB, at least **125 px tall** (300 dpi at 40 px), at most 4000 × 4000, aspect ratio between 1:1 and 8:1. Checked from the file's own header bytes on upload, not the declared type.
- `alt` = the org name. If an org has no logo, the box renders the org name as text (budget 30, 1 line), so a page never prints empty.

## Other Basic Benefits elements outside the text slots

| Element | In the copy |
|---|---|
| `<img alt="Basic Benefits">`, `assets/bb-logo-light.png` | the logo slot above; the BB logo file is **not** copied |
| footer link `neighbor.basicbenefits.com` | replaced by the agent area (as NOP does); no AP output can contain it |
| version stamp `NOP-P1-EN · 10/2026` | generated, never typed: `{ORG CODE}-P1-EN · {MM/YYYY of approval}`. New org field: org code, 2–6 capitals |
| `data-screen-label="01 Package 1 · Everyday Care"`, `<title>` | set from the package slots |
| design-system folder `_ds/basic-benefits-design-system-…` | same files, copied to a neutral folder name (`_ds/kit/`) |
| "NOP member ID card", "BenefitHub", "Healthyr", "SCOUT" | all inside text slots, so per org |
| colours, fonts, icons, card borders, spacing | fixed (the design system). Benefit-card icons stay as the kit's per-position icons |

**Release check:** every AP render fails if the final HTML contains `basicbenefits`, `Basic Benefits`, `bb-logo`, `NOP-P`, `BenefitHub`, `Healthyr` or `Neighborhood Outreach`, unless it came from that org's own slot text. Test orgs use obviously fake content ("Sample Benefits Co.").

## Packages = structured org data feeding the slots

```
ApPackage {
  id, layout: "P1" | "P2" | "P3",          // which kit layout it fills
  variants: { en?: SlotValues, es?: SlotValues },   // every slot of that layout, per language
  prices: { amounts: ["$36", "$45"] },     // shared by both languages; P3 has one
  pricing: ("price" | "noprice")[],         // which variants the org offers
}
```

Admin enters these on `/admin/organizations/{id}`. Every save is budget-checked, then rendered and fit-checked per slot. A language missing any slot isn't offered.

## Release checks: "approved version" instead of "as supplied"

NOP checks that nothing outside the footer differs from Basic Benefits' file. The AP copy checks that nothing outside the footer differs from **this org's approved version**:

1. **Draft.** Slot content can be edited freely. Every render of a draft (admin preview or agent) is a **PROOF**. A diagonal "PROOF" watermark and a "PROOF: not for distribution" band are drawn over the page, outside the hashed body. An org with no approved version can only produce proofs.
2. **Approve.** An admin action ("proofs approved", records who, when and an optional note) renders every offered template (package × language × price/no-price × Letter/bleed) from the current content. For each it takes the final body markup **outside the footer** (slots filled, before the agent area) and stores the SHA-256 plus the exact content snapshot:
   `ap:org:{id}:approved` → `{ version, approvedAt, approvedBy, content, hashes: { "{pkg}_{LANG}_{PRICE}_{size}": sha256 } }`, with earlier versions kept in `ap:org:{id}:approved-log`.
3. **Every later render** builds the page from the **approved snapshot** (not the live draft), recomputes the hash of the body outside the footer, and refuses unless it equals the stored hash. Then it places the agent area and runs the NOP gates: footer-only change, layout, fonts, QR read-back at 150 dpi, one page at the right size.
4. Editing content after approval makes a new draft. Agents keep the approved version until a new one is approved. Status `live` requires an approved version.

## Fit checks (measured on the real render, per slot)

Each slot element carries `data-ap-slot="{key}"`. On the laid-out page (print media, the same 150 dpi as NOP's agent render):

- **Per slot:** no horizontal overflow (`scrollWidth ≤ clientWidth`); rendered line count ≤ that slot's pinned max lines; box inside its card or column.
- **Per page** (NOP's gates, copied): `<main>` content doesn't overflow; footer ends at the page bottom; smallest vertical gap between blocks ≥ 0.08 in; price card rows on one line; agent-area gates and QR read-back.
- A failure names the slot (`card2.bullet3: 3 lines, max 2`) and blocks the save or approval.

**Tests (vitest plus a real Chromium render, both sizes, both languages):**
1. **Control:** Basic Benefits' own text entered as slot content reproduces NOP's body byte-for-byte (outside the logo, stamp and attributes listed above). This proves the slots are the only change.
2. **Long:** every slot at budget with realistic text, and at budget with wide characters (`W`, `M`). Measured gates either pass or reject naming the slot; nothing is ever clipped silently.
3. **Short:** every slot at 1–3 characters, a 1-digit price, a single bullet word. The page must still pass every gate: footer at bottom, cards keep their grid, price card aligned, no zero-height slot.
4. **Spanish:** the ES maxima.
5. **Approval:** hash recorded; a draft edit doesn't change agents' output; tampering with the snapshot makes renders refuse; an unapproved org yields only watermarked PROOF output.
