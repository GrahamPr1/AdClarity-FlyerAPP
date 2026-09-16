# Enterprise mode — pilot readiness notes

Open items that must be settled before real carrier or broker-dealer content
goes through the enterprise generation path. Kept separate from the code
because most of them are not code problems.

Status: Brief 1 (content-library schema) and Brief 2 (enterprise generation
mode) are built and verified against seeded dev fixtures. Brief 3 (demo UI) is
not started. Nothing here has been exercised against real approved content.

---

## OPEN — needs a compliance decision, not a code change

### 1. Unlocked-asset reformatting can strengthen a claim

**What happens.** An asset marked `locked: false` may be reworded — that is the
entire distinction between locked and unlocked. But rewording is not
claim-neutral. A hedged list item in an approved source can come out of
generation as a bare, unqualified bullet.

Observed on a real dev generation. The approved product sheet read:

> Options include guaranteed lifetime income, flexible withdrawal schedules,
> and spousal continuation.

The flyer rendered it as:

> - Guaranteed lifetime income
> - Flexible withdrawal schedules
> - Spousal continuation

Every word is asset-backed. "Options include" is gone, so a qualified statement
about what a product range *offers* now reads as a flat assertion of what the
reader *gets*. Under the current rules this is permitted, and both automated
checks pass it — correctly, because nothing was invented.

**Why this is not a pattern-matcher problem.** The checks in
`lib/agent-pipeline/enterprise.ts` bound *provenance*: `findVerbatimViolations`
proves locked text survived intact, and `findInventedComplianceLanguage` proves
regulatory-sounding text was not fabricated. Neither bounds *claim strength*,
and neither can. Deciding whether dropping "Options include" materially changes
what was approved is a judgement about the underlying product and the
regulator, not a property of the string. Any rule we invent here would encode a
compliance opinion nobody qualified has given.

**What is needed.** A decision from someone with real compliance authority on
the pilot carrier's side, on some version of:

- Does `locked: false` license reformatting, or only excerpting verbatim?
- If reformatting is allowed, does approval attach to the asset, or does each
  generated piece need review before it is sent?
- Should there be a third asset state between locked and unlocked — quotable in
  full or not at all, but never restructured?

Until that is answered, do not run a real carrier's approved library through
this path. Seeded fixtures only.

---

## OPEN — smaller, still unresolved

### 2. Both checks are log-only

`findVerbatimViolations` and `findInventedComplianceLanguage` write to the
server log and do not block delivery. That was a deliberate ruling for the
build-out runs so we could see what fires. Before any pilot, decide which
becomes reject-and-regenerate. A verbatim violation on a locked disclosure is
the strongest candidate — it is unambiguous and has no false-positive story.

### 3. Non-text assets are listed but not readable

`toAssetContext` passes logos, images and PDFs through as
`[<type> asset — not quotable]`. Extraction is out of scope for the prototype.
A real library is likely to be mostly PDFs, so the useful content of a pilot
account's library may be largely invisible to generation.

### 4. `findInventedComplianceLanguage` inherits unlocked phrasing

Phrase-level stripping (pass 2) removes any 3-word run appearing in an unlocked
asset. If an unlocked asset itself contains compliance-sounding phrasing, that
phrasing is lent to the model and invented text reusing it would pass. This is
the correct trade — the phrasing *is* approved content — but it means the check
bounds invention, not claim strength. Same root issue as item 1.

### 5. No provenance surface for the client

`sources[]` is persisted on the deliverable and verified correct for multiple
assets, but nothing in the UI shows it. Brief 3 should surface it; an agent who
cannot see which approved assets backed a piece cannot spot-check it.
