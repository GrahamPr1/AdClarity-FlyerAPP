# NOP Package Flyers: Handoff for OneFlyer

Final flyers for the Neighborhood Outreach Program packages (Basic Benefits).
Three packages, each in English and Spanish, each with and without pricing: 12 flyers.

## Contents

- `pdf/letter/`: print-ready PDFs, US Letter 8.5 x 11 in (home and office printing)
- `pdf/print-shop-bleed/`: print-ready PDFs, 8.75 x 11.25 in with 0.125 in bleed on all sides (trim to Letter)
- `html/`: standalone HTML source for every flyer. Opens in any browser, no build step or internet needed.
  - `*-Price.html` shows the monthly price box, `*-NoPrice.html` hides it
  - `*-bleed.html` is the same page sized for print-shop bleed
  - `_ds/` holds the design tokens and fonts (Poppins, Opificio). `assets/` holds the Basic Benefits logo.
- `previews/`: PNG preview of each flyer
- `logo/`: NOP logo as SVG plus a 3x PNG
- `icons/`: feature icons and checkmark as standalone SVGs (24 x 24, stroke uses currentColor)

File names: `NOP-{package}-{name}-{EN|ES}-{Price|NoPrice}`.

## Specs

- Page: US Letter. Bleed version extends the dark header and footer bands 0.125 in past the trim;
  all text keeps the same margin inside the trim. In the HTML this is the CSS variable `--bleed` on each page.
- Colors: navy #000836, blue #16B2F7, background #F7F8F9, body text #2b3348.
  Card accents: #20B7E8 (urgent care), #118A69 (Rx), #D97818 (lifestyle), #A48BEA (Package 3).
- Footer form codes: NOP-P1/P2/P3-EN and -ES, dated 10/2026.

## Usage rules

- Agents may use either the Price or NoPrice version.
- Benefit descriptions, prices and disclaimers are approved copy and must not be edited.
  Agent customization is limited to an agent information area (name, phone, QR code, enrollment link).
- NOP logo: use only the supplied files in `logo/` (blue banner, white and gold lettering). Do not redraw, restyle,
  recolor or create alternate versions. Any variation requires NOP's written approval. For a one-color or reversed
  version, request it from Basic Benefits.
- The Basic Benefits logo and design tokens are for Basic Benefits elements only. Do not apply them to the NOP mark.
- Spanish versions are pending final review. Do not distribute until Basic Benefits confirms approval.
