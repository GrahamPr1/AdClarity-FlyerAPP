# NOP flyers kit v2: what OneFlyer keeps from Basic Benefits' handoff

Copied unchanged from Basic Benefits' "NOP Package Flyers: Handoff for OneFlyer"
(README.md here is theirs). The HTML pages are the master source; OneFlyer
never edits them. The renderer inlines the stylesheets, fonts and logo they
link to, and leaves every page's <body> byte-for-byte as supplied.

Left out on purpose:
- Opificio and Opificio Rounded fonts. Basic Benefits' approved PDFs embed
  only Poppins, so OneFlyer matches them and does not bundle Opificio. The
  HTML's --font-accent falls back to Poppins, as it did when they made the PDFs.
- Poppins weights the approved PDFs don't use. Kept: Light, Regular,
  SemiBold, Bold, ExtraBold, ExtraBold Italic (exactly the six their PDFs embed).
- _ds_bundle.js, _ds_manifest.json and the design-system readme (not used by the pages).

reference/ holds their approved PDFs, for verification only (not bundled to
the server). Spanish pages are pending Basic Benefits' review: imported, but
agents can't see or download them until the admin switch turns them on.
