# DRAFT — Privacy Policy: event pages and reminder emails (English and Spanish)

> **Status: DRAFT, not published.** For approval before events are switched on
> for the program. Once approved, it goes into the existing "Information
> collected on agent pages" sections of `app/privacy/page.tsx` (English
> `#agent-pages`, Spanish `#agent-pages-es`), in the same deploy or before the
> program's events switch is turned on.
>
> The Spanish text is a draft for a qualified translator to review; it is not a
> reviewed translation.
>
> Wording drafted by an engineer, not legal advice. Every claim matches the
> code: the RSVP form and route (`app/api/enterprise/nop/events/[code]/rsvp`),
> RSVPs saved as requests under the agent (`lib/enterprise/portal/agent-data.ts`),
> the day-before emails (`lib/enterprise/portal/event-reminders.ts`), and the
> existing retention and deletion rules, which apply to RSVPs unchanged.

## What changes

Two edits to each language's section. Nothing else in the published text
changes: who receives requests, spam prevention, retention (12 months after the
agent leaves) and deletion on request already cover RSVPs, because an RSVP is
stored and handled as a request.

1. **"The contact forms" paragraph:** the first sentence now names event
   pages, and the list of what's collected adds the number of guests.
2. **A new paragraph, "Events,"** placed right after "Who receives it."

---

## English (`#agent-pages`)

**1. "The contact forms" — replace the paragraph with:**

> **The contact forms.** Some agents have a OneFlyer page with a form to ask
> them to contact you: the page their flyer's QR code opens, their personal
> page (oneflyer.org/p/…), or a page for an event they're hosting
> (oneflyer.org/e/…), where you can RSVP. If you submit one, we collect what you
> enter (your name, phone number, and optionally your email address and a
> message, plus, for an event, how many guests you're bringing), the date and
> time, the language the page was shown in, and the exact consent statement you
> agreed to by checking the box, with the agent's name as it was shown.

**2. New paragraph after "Who receives it":**

> **Events.** When you RSVP to an event, the agent hosting it receives your
> RSVP like any other request, and the day before the event they get an email
> listing everyone who RSVP'd. If you gave your email address, we send you one
> reminder email the day before the event, in the language you used, with the
> time, the place and how to reach the agent. Replies to it go to the agent.
> We don't send it if the event is cancelled or taken down, and we don't send
> text messages.

---

## Spanish (`#agent-pages-es`)

**1. "Los formularios de contacto" — replace the paragraph with:**

> **Los formularios de contacto.** Algunos agentes tienen una página de
> OneFlyer con un formulario para pedirles que lo contacten: la página que abre
> el código QR de su volante, su página personal (oneflyer.org/p/…) o la página
> de un evento que organizan (oneflyer.org/e/…), donde puede confirmar su
> asistencia. Si usted envía uno, recopilamos lo que escribe (su nombre, su
> número de teléfono y, si lo desea, su correo electrónico y un mensaje, y, en
> el caso de un evento, cuántos acompañantes llevará), la fecha y la hora, el
> idioma en que se mostró la página y la declaración de consentimiento exacta
> que aceptó al marcar la casilla, con el nombre del agente tal como se mostró.

**2. New paragraph after "Quién la recibe":**

> **Eventos.** Cuando usted confirma su asistencia a un evento, el agente que
> lo organiza recibe su confirmación como cualquier otra solicitud, y el día
> antes del evento recibe un correo con la lista de todas las personas que
> confirmaron. Si usted dio su correo electrónico, le enviamos un solo correo
> de recordatorio el día antes del evento, en el idioma que usó, con la hora,
> el lugar y cómo comunicarse con el agente. Las respuestas a ese correo le
> llegan al agente. No lo enviamos si el evento se cancela o se retira, y no
> enviamos mensajes de texto.

---

## Checked against the code

- **What's collected:** name, phone, optional email, optional message, guests
  (0–10), date and time, page language, consent as shown. No address, no
  date of birth.
- **Who gets it:** the agent (an email per RSVP, and the RSVP in their Leads
  tab), the program admin and OneFlyer staff (the admin Events list shows
  counts; the Leads data as today). It isn't shared with other agents.
- **Reminder:** one email per RSVP with an email address, the day before in the
  event's time zone, in the RSVP's language, reply-to the agent. It's marked as
  sent, so it never repeats. None for cancelled or hidden events. No SMS.
- **Agent's list:** one email per event, the day before, to the agent only.
- **Retention and deletion:** RSVPs are requests under the agent's ID, so the
  12-month deletion after the agent leaves, and deletion on request, apply as
  published.
