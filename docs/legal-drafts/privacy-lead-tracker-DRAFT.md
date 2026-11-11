# DRAFT — Privacy Policy: agents' lead statuses, follow-up dates and notes (English and Spanish)

> **Status: DRAFT, not published.** Publish before or with the deploy that
> merges the lead tracker (Part D). Two additions to the published page
> (`app/privacy/page.tsx`): one paragraph in each agent-pages section (for the
> people who send a request), one list item in each Agent accounts section
> (for the agent).
>
> The Spanish text is a draft for a qualified translator to review.
>
> Matches the code: status, follow-up date and notes are stored on the lead
> record (`LeadRecord.status`, `followUpOn`, `notes`; `lead-tracker.ts`), so
> they're kept, seen and deleted exactly as the lead is (12-month deletion,
> deletion on request, account deletion). Program admins and OneFlyer staff see
> them when they open the agent's portal read-only, as they see the leads.

---

## 1. Agent pages: new paragraph after "How the agent uses it" / "Cómo la usa el agente"

**English (`#agent-pages`)**

> **The agent's notes.** The agent can keep track of your request in
> OneFlyer: a status (for example, contacted, appointment set or enrolled), a
> date to follow up, and private notes. These are kept with your request and
> deleted with it. The program's administrators and authorized OneFlyer staff
> can see them, as they can your request.

**Spanish (`#agent-pages-es`)**

> **Las notas del agente.** El agente puede dar seguimiento a su solicitud en
> OneFlyer: un estado (por ejemplo, contactado, cita programada o inscrito),
> una fecha para dar seguimiento y notas privadas. Se guardan con su solicitud
> y se eliminan con ella. Los administradores del programa y el personal
> autorizado de OneFlyer pueden verlas, como pueden ver su solicitud.

## 2. Agent accounts: new list item under "While you use your account" / "Mientras usa su cuenta", after the requests and RSVPs item

**English (`#agent-accounts`)**

> - the statuses, follow-up dates and private notes you add to your leads
>   (the program's administrators and OneFlyer staff can see them, as they can
>   your leads);

**Spanish (`#agent-accounts-es`)**

> - los estados, las fechas de seguimiento y las notas privadas que agrega a
>   sus contactos (los administradores del programa y el personal de OneFlyer
>   pueden verlos, como pueden ver sus contactos);
