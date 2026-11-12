# Agent portal (Neighborhood Outreach Program): status

As of 12 November 2026 (kit-v2 spacing and the enrollment setting). For picking the work back up later.
Org switches are in admin → Agents → "Org features"; the defaults are in
`lib/enterprise/portal/features.ts` (`FEATURES_OFF_BY_DEFAULT`).

## Live on production

- **Agent sign-up and sign-in**: self sign-up with admin approval; emailed
  6-digit codes; program admins (Quinn) at `/program`.
- **Flyers**: kit v1.1.1 for agents, with their name, phone, email, Agent ID,
  enrollment link and QR; previews, print-shop/home PDFs and social image.
- **Leads** (Pro): QR scans counted; personal web page `/p/{code}` with
  contact form, "Save my contact" (vCard) and booking link; lead email to the
  agent; Leads tab with status, private notes, follow-up date, filters and
  "Needs follow-up"; follow-up message buttons.
- **Optional text-message consent** on every lead form (shows once the SMS
  wording is saved in admin); SMS opt-out list in admin. Nothing sends texts.
- **Events** (Pro, switched on): event pages with RSVPs, day-before reminders
  (to RSVPs and to the agent), admin Hide/Unhide, check-in page and printable
  check-in sign.
- **Recruiting** (Pro, switched on): personal invite link and QR; recruiter
  recorded on sign-ups; recruits list.
- **Daily follow-up reminder email** (Pro, on), **monthly results email**
  (Pro, switched on), **email signature** (Pro, on).
- **Results on Home** (Pro): leads, contacted, appointments set, enrolled, QR
  scans this month. Basic agents see no numbers.
- **Pro screen** (`/agent/pro`), page preview for Basic agents, upgrade prompts,
  "Upgrade to Pro" card on Basic Home. Buying is off on production (see
  billing below), so these show "contact your program administrator".
- **Admin**: agents list and detail (tier, Remove from program / Undo, Delete
  account, view-as), events list, program admins, sign-up approvals, scheduled
  deletion, SMS opt-outs, run logs and dry runs for the emails.
- **Privacy**: account deletion (admin, and automatically 12 months after
  removal), log redaction on deletion, no Google Analytics / GTM / Meta Pixel on
  agent and program pages. Privacy Policy published (EN/ES) for everything
  above, dated 11 November 2026.
- **Crons** (`vercel.json`): lead/account deletion 09:00 UTC (live:
  `NOP_RETENTION_LIVE=on`), event reminders 14:00 UTC, follow-up reminders
  14:00 UTC, monthly results email 15:00 UTC on the 1st.
- **Email**: from `noreply@oneflyer.org`, reply-to `support@oneflyer.org`
  (ImprovMX forwarding); SPF, DKIM and DMARC (`p=none`) set.

## Built but switched off

- **Agent Pro billing ($40/month)**: built and tested in the Stripe sandbox
  only. No live price, webhook or portal configuration; the three Vercel
  variables aren't set on production. See "Paused" below.
- **Pro free trial**: built, off (owner setting in admin).
- **Team dashboard** (Leader tier, admin-set; "Send to team"): off.
- **Print requests**: off (no print partner yet).
- **QR lead page** (QR opens a page with Enroll now + form instead of
  forwarding): off.
- **Agent photo** on the personal page: off.
- **Kit v2 flyers** (new agent footer, approved spacing on every page): admin-only;
  agents stay on kit v1.1.1. Spanish kit v2 off (it can't be switched on unless
  every Spanish page passes the release checks).

## Waiting on Basic Benefits

- **Enrollment link**: see "When the enrollment link arrives" below.
- **Templates**: the printed enrollment form (option 3 or 4, then the
  two-part template), the **event flyer** template (marked spot:
  `EVENT_FLYER_READY`), the **recruiting flyer** template
  (`RECRUIT_FLYER_READY`).
- **Spanish flyers**: kit v2 Spanish stays off until approved; all Spanish UI
  and policy text is unreviewed and needs a qualified translator.
- **Wording**:
  - the text-message consent wording (paste into admin when approved);
  - follow-up messages and package texts on the agent page;
  - approval of the QR lead page and agent photos;
  - the string review CSVs (`NOP-*-Strings-EN-ES-for-review.csv`, one per
    part, plus `NOP-Plain-Wording-Changes-EN-ES-for-review.csv`). "Contactos"
    vs "Prospectos" for leads is flagged in them.

## When the enrollment link arrives

The enrollment setting has three parts (admin → Agents → "NOP enrollment
link"): the **forward URL** (where QRs go, with `{id}` where the Agent ID
goes), what the flyers **print** (a short address ending in `/{id}`, or each
agent's `oneflyer.org/a/<code>` link), and the **program page** (for unknown
or inactive agents). Until it's saved, it's still the old single domain
(`join.basicbenefits.com`), unchanged. "Switch agents to kit v2" refuses until
it's saved, its URLs load, and test agent 858980's forward page shows a real
partner (not "Partner Not Found", checked in a browser).

1. **Ask the program** for:
   - one real, active agent's working enrollment URL, with their Agent ID;
   - confirmation that the ID in it is our Agent ID (not a separate partner
     code: that would need a code change first);
   - that **858980 is set up as a partner** on their side, so its page shows a
     real partner (if it never will be, tell me: the switch check needs a
     test ID that works);
   - the short address to print, if any (it must load and lead to the same
     page), or agree on printing `oneflyer.org/a/<code>`;
   - the program page URL.
2. **Check the real agent's URL** in your phone's browser: it shows that
   agent's enrollment page.
3. **Save the setting**: forward URL (the real URL with the Agent ID replaced
   by `{id}`), printed address, program page; "Check and save". It's refused
   if a URL doesn't load or the printed address doesn't fit the flyers. If it
   says the test agent's page shows "Partner not found", stop: don't "Save
   anyway" (858980 isn't set up yet; back to step 1).
4. **Read the result**: "A test agent's QR now forwards to …" and "flyers
   print …" match what the program sent. Click "Check the test agent's page in
   a browser": it says "Shows a page".
   Every agent's QR (kit v1.1.1 flyers already printed included) now forwards
   to the new URL; kit v1.1.1 downloads print the new address.
5. **Test a real flyer**: download a kit-v2 flyer as the real agent (admin,
   render-check with their Agent ID, Letter), print it, scan the QR with your
   phone (that agent's page), and type the printed address into your phone
   (the same page). Scan an already-printed kit v1.1.1 flyer too: it goes to
   the new URL.
6. **Switch agents to kit v2** (admin → Agents → NOP flyers), and confirm. If
   it refuses, the message says which check failed.
7. Tell me: I'll check production's forward log for real scans. Spanish stays
   off until the program approves it.

## Paused: billing go-live checklist

Paused 11 November 2026 (the payment provider and the flyer templates may
change). Don't build the live setup script or publish the Terms/Refund
sections until this is picked up. Draft:
`docs/legal-drafts/agent-pro-billing-DRAFT.md` (Terms + Refund, EN/ES, incl.
free trial). Sandbox setup: `scripts/stripe-agent-setup.ts` (test keys only).

1. **Owner**: confirm production's `STRIPE_SECRET_KEY` is the live key. If it's
   still a sandbox key, stop: switching it moves SMB billing too.
2. **Owner**: in Stripe live mode, create "OneFlyer Agent Pro", $40.00 USD
   monthly, **"Include tax in price" set explicitly to No** (tax-exclusive),
   lookup key `oneflyer_agent_pro_monthly_v1`. Share the price ID.
3. **Engineer**: add a guarded `--live` mode to `scripts/stripe-agent-setup.ts`
   (checks the live price; creates/updates the agent portal configuration:
   card, invoices, cancel at period end, no plan switching).
4. **Owner**: run it locally with the live key
   (`npm run stripe:agent-setup -- --live`); note the portal configuration ID.
5. **Owner**: live webhook `https://oneflyer.org/api/stripe/agent-webhook`, API
   version `2025-06-30.basil`, events: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
6. **Owner**: Vercel Production variables `STRIPE_PRICE_AGENT_PRO_MONTHLY`,
   `STRIPE_AGENT_WEBHOOK_SECRET`, `STRIPE_AGENT_PORTAL_CONFIGURATION_ID`.
7. **Engineer**: publish the Terms (`#agents`, `#agents-es`) and Refund
   (`#agent-pro`, `#agent-pro-es`) sections in the same deploy (Spanish
   reviewed first, or approved as is).
8. **Engineer**: check production after the deploy (webhook reachable, legal
   pages, Upgrade button for a Basic agent); owner sends a test event from the
   live webhook page.
9. **Owner**: live smoke test with a real card: set test agent 123456 to Basic
   in admin, buy Pro from Home, confirm "Your Pro plan" and "Paid Pro" in
   admin.
10. **Owner**: cancel immediately and refund in full in the Stripe Dashboard;
    engineer confirms the webhook moved the agent back to Basic.
11. Free trial stays off until decided. To pause buying again, remove the three
    variables in step 6 and redeploy.
