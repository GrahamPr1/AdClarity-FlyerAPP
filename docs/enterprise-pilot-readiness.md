# Enterprise mode — pilot readiness notes

Open items that must be settled before real carrier or broker-dealer content
goes through the enterprise generation path. Kept separate from the code
because most of them are not code problems.

Status: Brief 1 (content-library schema), Brief 2 (enterprise generation mode)
and Brief 3 (internal demo at /admin/enterprise-demo) are built and verified
against seeded dev fixtures. Nothing here has been exercised against real
approved content.

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

### 5. No provenance surface for the CLIENT

Resolved for internal review only. `/admin/enterprise-demo` shows per-block
provenance (`lib/agent-pipeline/attribution.ts`), but it is admin-gated. The
agent producing the campaign still has no way to see which approved assets
backed their piece, and they are the person who would actually spot-check it
before sending.

### 6. Block-level attribution mislabels MIXED blocks

Observed on a real run. The model fused an approved sentence with its own copy
into one paragraph:

> Northstar Mutual's retirement income solutions are designed for people within
> ten years of retiring — join Dana Reyes for a clear, no-pressure evening on
> your options.

The first clause is verbatim approved text; the second is invented. The block
gets one label (`adapted`, 56% traceable), because a block is the smallest unit
the panel resolves. That is the safe direction — it lands in the amber "look at
this" bucket rather than being certified by its approved half — but a reviewer
should know the label describes the block, not every clause in it. Sub-block
attribution would need span-level diffing and is not built.

### 7. Enterprise generation runs close to the pipeline timeout

Five enterprise runs on the same 2-asset library completed the flyer stage at
**125s, 155s, 244s, 230s and 350s**, against `PIPELINE_TIMEOUT_MS` of 285s.
One exceeded it and the deliverable was marked Failed — the generation itself
succeeded at +350s, after the pipeline had already given up.

The ceiling is not the problem and must not be raised: it sits just under
Vercel's 300s function limit, so there is nowhere for it to go. The problem is
that enterprise mode carries the full asset library plus the enterprise prompt
plus a `sources` array in the output grammar, and lands much nearer that
ceiling than SMB does — with enough variance to cross it. A real library with
more than two assets makes this worse, not better.

Needs a decision before a pilot: batch size limits, trimming which assets are
sent per request, or splitting selection from composition into two shorter
calls.
