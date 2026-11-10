# DRAFT — Privacy Policy: optional text-message consent (English and Spanish)

> **Status: DRAFT, not published.** Publish before the program's text-message
> wording is entered in admin (the checkbox appears on the forms only once
> that wording is saved). Placement: a new paragraph in each "agent pages"
> section, right after **Events** / **Eventos** (`#agent-pages`,
> `#agent-pages-es`).
>
> The Spanish text is a draft for a qualified translator to review.
>
> Wording drafted by an engineer, not legal advice. Matches the code: the
> optional second checkbox (`components/nop-lead-form.tsx`), what's stored
> (`LeadRecord.smsConsent`: agreed yes/no, text, version, language, time,
> phone), the opt-out list (`lib/enterprise/sms-optout.ts`, add-only, kept
> after a request or account is deleted), and that nothing sends texts yet.

---

## English (`#agent-pages`, after "Events")

> **Text messages.** Some forms have a second, optional box to agree to get
> text messages from the agent about your request and upcoming events. You
> don't have to tick it to send the form. Either way, we record your answer,
> the exact words you saw, the language, the date and time, and the phone
> number it applies to. To stop text messages, reply STOP, or tell the agent,
> the program or us. We then keep your number on a do-not-text list, so it
> isn't texted again, even if your request is later deleted. We don't sell
> your number or share it for anyone else's marketing.

## Spanish (`#agent-pages-es`, after "Eventos")

> **Mensajes de texto.** Algunos formularios tienen una segunda casilla,
> opcional, para aceptar recibir mensajes de texto del agente sobre su
> solicitud y próximos eventos. No tiene que marcarla para enviar el
> formulario. En cualquier caso, registramos su respuesta, las palabras exactas
> que vio, el idioma, la fecha y la hora, y el número de teléfono al que se
> aplica. Para dejar de recibir mensajes de texto, responda STOP o avísele al
> agente, al programa o a nosotros. Después guardamos su número en una lista de
> números a los que no se envían mensajes de texto, para que no se le vuelva a
> escribir, aunque después se elimine su solicitud. No vendemos su número ni lo
> compartimos para el mercadeo de otros.

---

## Notes for the owner

- **Nothing sends text messages yet.** This paragraph describes the consent and
  the opt-out list. When automated texting is built, the policy will need a
  sentence naming the texting provider (e.g. under "Who processes it"), and
  the STOP/HELP replies will have to be handled by that provider.
- **"Reply STOP" works only once there's a texting number.** Until then, STOP
  replies go to the agent's own phone (if they text from it); the agent or
  program would tell an admin, who adds the number in admin.
- The main consent line already says the agent may contact people "by phone
  call, text message, or email". That consent covers the agent personally
  reaching out; this new box is the separate consent automated texting needs.
