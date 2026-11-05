# DRAFT — Privacy Policy: agent lead pages (NOP Phase 2)

> **Status: for review. Nothing on the live Privacy Policy (`app/privacy/page.tsx`) has been changed.**
> Publish this in the same deploy that opens the first agent lead form, which is the
> deploy where Basic Benefits' approved consent text is entered. Not before: today
> every agent lead page shows "Coming soon" and collects nothing.
>
> This is wording drafted by an engineer, not legal advice. Items marked **[CHECK]**
> depend on a decision only you (or Basic Benefits) can make.

Proposed new section, placed after **"Information collected on offer pages"**:

---

## Information collected on agent pages

Some organizations use OneFlyer to give their independent agents personalized flyers.
An agent's flyer may carry a QR code that opens a short OneFlyer link, which forwards
you to the organization's enrollment page.

**Scans.** When that QR code is scanned, we count the scan for the agent. We record
only that a scan happened and the month it happened in. We do not record who
scanned it, your IP address, or your device.

**The contact form.** An agent may also have a contact page hosted by OneFlyer. If
you submit the form on it, we collect the information you enter (your name, phone
number, and optionally your email address and a message), the date and time of your
submission, the language the page was shown in, and the exact consent statement you
agreed to by ticking the box.

**Who receives it.** Your information goes to the agent whose page you used, so they
can contact you. We email the agent to tell them a new request has arrived. OneFlyer
stores and delivers it on the agent's and their organization's behalf. Authorized
OneFlyer staff can see it to run and support the service.
[CHECK: Basic Benefits staff have no access today, not even to totals; only OneFlyer
admins see per-agent totals. If Basic Benefits are given access, this sentence must
name them.] We do not sell your information, share it
with other agents or businesses, or use it for our own marketing.

**If an agent's account changes.** Requests are kept with the agent's program ID
rather than a personal login. If an agent's program ID is reassigned or corrected,
OneFlyer staff may move the requests to the correct ID. Every such move is recorded.

**How the agent uses it.** The agent and their organization are responsible for how
they contact you after they receive your request. If you no longer want to hear from
them, tell the agent or contact the organization directly.

**Spam prevention.** To prevent automated abuse, we temporarily use your IP address
to limit repeated submissions. It is not stored with your request.

**How long we keep it.** [CHECK: decision needed, see below.] We keep a request
until [the agent's organization or OneFlyer deletes it / N months after the agent
leaves the program], whichever comes first.

**Your choices.** To have a request you made deleted, contact the agent, or contact
us through our [Contact page](/contact) at oneflyer.org/contact, and we will remove it.

---

## Decisions needed before publishing

1. **Retention.** Requests belong to the Agent ID, so deleting an agent's OneFlyer
   login does **not** delete them today (by design: decision 6, data stays with the ID).
   Pick a rule:
   - (a) keep until deleted by OneFlyer on request;
   - (b) delete N months after the agent's roster status becomes terminated;
   - (c) something Basic Benefits specifies.

   There's no automatic deletion yet. (b) would need a scheduled job, which I'd build
   only once you choose it.
2. **Who at the organization can see requests.** Today: the agent, plus OneFlyer
   admins. Basic Benefits staff have no access (the admin page is OneFlyer only, per
   your decision 5). The brief's "the org can see totals" is met only through OneFlyer
   admin for now. Confirm that's the intended rule.
3. **Consent wording.** The policy quotes no consent text. The form shows Basic
   Benefits' approved statement verbatim and stores it with each request. Confirm
   their statement is consistent with this section.
4. **Spanish.** The live Privacy Policy is English only. The agent pages are bilingual.
   Decide whether a Spanish version of this section is needed (it would need a
   reviewed translation, not a machine one).
