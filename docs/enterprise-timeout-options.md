# Item 7 — enterprise generation runs close to the pipeline timeout

Decision document. No implementation until a direction is chosen.

## The measurement

Five enterprise runs, same 2-asset library, same prompt shape, flyer-stage
completion time:

| run | flyer stage done |
|-----|------------------|
| 1 | 125s |
| 2 | 155s |
| 3 | 244s |
| 4 | 230s |
| 5 | **350s** |

`PIPELINE_TIMEOUT_MS` is 285s. Run 5 crossed it. Median is ~230s, spread is
2.8×, and nothing about the input changed between runs — this is model latency
variance on one long structured-output call, not a function of the request.

Two things follow, and they matter for reading the options below:

1. **The ceiling cannot move.** It sits ~15s under Vercel's 300s function
   limit, which is where the margin to record a terminal state comes from.
   There is no headroom to buy by raising a number.
2. **The variance is the problem, not the mean.** A fix that shaves 20% off
   the median still leaves run-5-shaped runs crossing the line. Anything that
   only reduces average latency is treating the wrong statistic.

Separately fixed, and not a substitute for any of this: a run that crosses the
ceiling but succeeds is no longer reported as Failed (commit `fae038e`). That
removes the worst *symptom* — a client being told a successful campaign
failed. It does nothing about a run that genuinely gets killed at 300s, which
is what these options address.

**Scaling context.** The demo library is 2 text assets, ~380 characters total,
sent in full on every request. A pilot-scale library is plausibly 20–50 assets
including PDFs. At that size the library alone could exceed the flyer prompt,
and input tokens grow linearly while the output grammar stays fixed — so
option viability at demo scale says very little about pilot scale. That column
is the one to read.

---

## Option A — cap what goes into the request

**What it changes.** Stop sending the whole library. Send at most N assets,
selected by cheap relevance scoring (keyword overlap between the promotion
request and each asset's label + content) before the generation call.

**Cost.**
- *Latency*: reduces input tokens, which is the part of the prompt that grows
  with library size. Helps meaningfully at pilot scale, barely at all at demo
  scale — with 2 assets there is nothing to cut.
- *Complexity*: low. One scoring function and a cap, no change to the
  generation call, the schema, or either check.
- *Reliability*: **this is where the real cost is.** Selection moves from the
  model to a keyword heuristic. Right now the prompt tells the agent to ignore
  irrelevant assets and it does; a pre-filter that drops the one asset the
  piece needed produces a flyer missing required content — and if that content
  was a mandatory disclosure, the failure is regulatory rather than cosmetic.
  Mitigable by never filtering locked assets, at the cost of the cap being
  weaker exactly when the library is disclosure-heavy.

**Viability.** Demo scale: pointless. Pilot scale: necessary but not
sufficient — it addresses growth in input size, not the 2.8× variance already
present at 2 assets. Run 5 would still have crossed.

---

## Option B — split selection from composition into two calls

**What it changes.** Call 1 gets the library and returns only asset IDs and a
content plan — small output, small grammar. Call 2 gets just the selected
assets and composes the flyer. Two short calls in place of one long one.

**Cost.**
- *Latency*: total wall-clock probably goes **up** at the median — two round
  trips, and call 2 still has to write the whole flyer, which is where most of
  the time goes. The gain is not speed; it is that each call's failure is
  independently bounded, and call 1's result can be persisted so a retry skips
  it.
- *Complexity*: high. A second prompt, a second schema, a second grammar, and
  a new intermediate state to store and resume from. Both enterprise checks
  currently run against the finished HTML and would need to be re-reasoned
  about — `findInventedComplianceLanguage` strips against the library, and
  after a split, "the library" for call 2 is a subset, which changes what
  counts as invented.
- *Reliability*: better failure isolation, worse failure surface. Two calls
  are two things that can fail, but a failure in either is now recoverable
  rather than losing the whole run.

**Viability.** Demo scale: unjustifiable — pure complexity for a 2-asset
library. Pilot scale: this is the only option here that also solves selection
quality, because the model keeps choosing rather than a keyword heuristic. But
it does not by itself keep call 2 under the ceiling, so it likely pairs with C
rather than replacing it.

---

## Option C — move generation off the request path

**What it changes.** Stop generating inside a 300s function. Enqueue the job
(Vercel Queues, or a durable workflow) and let it run to completion without a
wall-clock ceiling at all; the client polls the deliverable as it already
does.

**Cost.**
- *Latency*: unchanged for the user — they already wait and poll. What
  disappears is the ceiling, and with it the entire class of "succeeded at
  350s, killed at 300s".
- *Complexity*: highest. New infrastructure, new failure modes (queue
  visibility, at-least-once delivery means the pipeline must become idempotent
  — it currently is not; a redelivered job would generate and bill twice).
  `waitUntil` and both `maxDuration` declarations come out.
- *Reliability*: strictly the best outcome once built. The 2.8× variance stops
  mattering because nothing is racing a deadline. It is also the only option
  that survives a library large enough to make a single call take 400s+.

**Viability.** Demo scale: overkill, and would delay the demo. Pilot scale:
this is the one that actually holds. Everything else is buying margin against
a ceiling; this removes the ceiling.

---

## Recommendation

**For the demo: do nothing more.** The false-Failed fix already removes the
user-visible harm, and at 2 assets neither A nor B buys anything real. Adding
infrastructure before a pilot commitment is speculative work.

**For a pilot: C, with A as a cheap interim.** A is a few hours and reduces
input growth; it can ship whenever a real library shows up and is worth having
regardless. But A and B both manage a deadline that C deletes, and a real
carrier library plus a 2.8× latency spread will keep producing run-5s for as
long as the deadline exists.

**What would change this recommendation:** if measurement at real library size
shows the median well under 285s with variance inside ~1.5×, A alone is
adequate and C is premature. That measurement does not exist yet, and cannot
until there is a real library to measure — which is blocked behind the
compliance decision in pilot-readiness item 1. Worth sequencing that first.

**Not recommended:** raising `PIPELINE_TIMEOUT_MS`. There is nowhere for it to
go, and the ~15s it would eat is the margin that lets a terminal state be
recorded at all.
