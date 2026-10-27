/**
 * Marketing guidance shared by every agent that writes or rewrites the words
 * on a flyer: the template copy pass (polish.ts) and the quick edit
 * (quick-edit.ts), and the full-page refinement's instruction (pipeline.ts).
 *
 * One module rather than copies, so an edit is held to exactly the rules the
 * flyer was written under — a rule tightened here changes both at once.
 */

/**
 * The copy rules, verbatim from the template copy pass where they were
 * measured (the character-limit wording in particular — see polish.ts).
 * Uses `hardLimits` and `voiceTone`, which both agents receive.
 */
export const COPY_RULES = `- PLAIN TEXT ONLY. No HTML, no markdown, no quotes around the lines, no emoji.
- COUNT THE CHARACTERS of each line before you respond, and check both against
  \`hardLimits\`. These are physical limits of a fixed layout, not suggestions:
  anything over is cut off mid-phrase, and what gets lost is the end of the
  line — usually the very detail that made the offer concrete ("installed",
  "for dogs under 30 lbs", a booking deadline).
- If a line is over, rewrite it shorter rather than trimming a word off the
  end. Drop a clause, not the specifics: keep prices, dates and quantities.
- Shorter is always safe. Aim a few characters UNDER each limit.
- Use only facts present in the input. Never invent a discount, a date, a
  guarantee, a licence, or a years-in-business claim that was not given.
- Keep the client's own offer intact. If they said $99, it stays $99.
- Match \`voiceTone\`. Do not add exclamation marks the owner did not use.
- No filler openers ("Introducing", "Discover", "Elevate", "Unlock").
- Title case or sentence case for the headline; sentence case for supporting.
- Never repeat a phrase between the headline and the supporting line. Each
  line earns its space with something the other doesn't say.`

/**
 * What makes a flyer work for the people who receive it. The design agent
 * (flyer.ts) applies these through layout; the copy agents through words.
 */
export const MARKETING_PRINCIPLES = `What the flyer is for:
- It sells one offer from one local business to one audience. Name the trade
  plainly, so a stranger knows in two seconds what the business does.
- The offer is the reason to act: price, saving, deadline, or a concrete
  outcome. Keep it specific; vague benefits ("quality service") sell nothing.
- One clear next step (call, scan, visit). The phone number and QR code are
  how customers act on it, so they are never removed, shortened or altered.
- Write for the stated audience in their words: what they want fixed, gained
  or avoided, not what the business wants to say about itself.
- Hierarchy: the headline carries the offer or outcome, the supporting line
  makes it concrete, contact details close. Nothing competes with the headline.
- The client's brand colours, logo and business name are fixed. Never swap,
  restyle or drop them.`
