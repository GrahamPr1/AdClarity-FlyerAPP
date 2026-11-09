# DRAFT — Privacy Policy: agent lead pages (NOP Phases 2–3)

> **Publish only when lead capture goes live, together with the 12-month deletion job and a reviewed Spanish version.**
>
> **Status: for review. Nothing on the live Privacy Policy (`app/privacy/page.tsx`) has been changed.**
> The **Scans** paragraph applies as soon as the OneFlyer QR link reaches production.
> The rest applies once a lead form is live: the QR lead page is switched on for the
> org (off by default) AND the program's approved consent text is entered. Until
> then no form collects anything. Publish each part no later than the deploy or
> switch that makes it true.
>
> This is wording drafted by an engineer, not legal advice. Items marked **[CHECK]**
> depend on a decision only you (or the Neighborhood Outreach Program) can make.

Proposed new section, placed after **"Information collected on offer pages"**:

---

## Information collected on agent pages

Some organizations use OneFlyer to give their agents personalized flyers.
An agent's flyer may carry a QR code that opens a short OneFlyer link, which takes
you to the organization's enrollment page.

**Scans.** When that QR code is scanned, we count the scan for the agent. We record
only that a scan happened and the month it happened in. We do not record who
scanned it, your IP address, or your device.

**The contact form.** For some agents, the QR code may instead open a OneFlyer page
with a button to enroll and a form to ask the agent to contact you. If you submit
that form, we collect the information you enter (your name, phone
number, and optionally your email address and a message), the date and time of your
submission, the language the page was shown in, and the exact consent statement you
agreed to by ticking the box. Some agents also have a personal OneFlyer page
(oneflyer.org/p/…) with the same form; what you submit there is collected and handled
exactly as described in this section.

**Who receives it.** Your information goes to the agent whose flyer you scanned or whose
page you visited, so they can contact you. We email the agent to tell them a new request has arrived. OneFlyer
stores and delivers it on the agent's and their organization's behalf. Authorized
OneFlyer staff can see it to run and support the service. The organization's own
staff do not have access to it. We do not sell your information, share it
with other agents or businesses, or use it for our own marketing.

**If an agent's account changes.** Requests are kept with the agent's program ID
rather than a personal login. If an agent's program ID is reassigned or corrected,
OneFlyer staff may move the requests to the correct ID. Every such move is recorded.

**How the agent uses it.** The agent and their organization are responsible for how
they contact you after they receive your request. If you no longer want to hear from
them, tell the agent or contact the organization directly.

**Spam prevention.** To prevent automated abuse, we temporarily use your IP address
to limit repeated submissions. It is not stored with your request.

**How long we keep it.** We keep a request while the agent is active in the
organization's program. If the agent leaves the program, we delete their requests
12 months after the date they left. We delete a request sooner if you ask us to, or
if the agent's organization asks us to.

**Your choices.** To have a request you made deleted, contact us through our
[Contact page](/contact) at oneflyer.org/contact, and we will remove it. You can also
ask the agent or their organization. Deleting it from OneFlyer does not delete any
copy the agent already made, for example in their phone or email.

---

## Decisions needed before publishing

1. **Retention (decided).** Leads are kept while the agent is active. A 12-month
   clock starts when the roster marks the agent terminated (or the agent is removed
   from the roster), and the leads are due for deletion at its end. Admins can delete
   sooner on request from the person or from the program; every deletion is logged
   without the person's details. **What exists now:** the clock's start date and
   due date are recorded on each roster import, and admin deletion works. **Not yet:**
   the scheduled job that deletes at the due date (it comes with the cron phase), and
   a roster "remove" action (imports only add and update today; whatever removes an
   agent later must start the same clock). Publish the retention sentence no earlier
   than the deploy that adds the job, or state the gap. [CHECK]
2. **"Left the program" (decided).** Only *terminated* or *removed from the roster*
   starts the 12-month clock. *Suspended* and *pending* don't.
3. **Who at the organization can see requests (decided for now).** None. Only the
   agent and OneFlyer admins. If the program's staff are ever given access, the
   "Who receives it" paragraph must name them before that access goes live.
4. **Consent wording.** The policy quotes no consent text. The form shows the
   program's approved statement verbatim and stores it with each request. Confirm
   their statement is consistent with this section.
5. **Spanish (decided).** A reviewed Spanish version (not a machine translation) is
   published together with this section. Not built yet.
