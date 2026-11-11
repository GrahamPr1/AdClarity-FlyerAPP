# DRAFT — Privacy Policy: checking in at an event (English and Spanish)

> **Status: DRAFT, not published.** Publish with the Part H merge. One new
> paragraph in each agent-pages section of `app/privacy/page.tsx`, right after
> **Events** / **Eventos**. The "contact forms" paragraph already lists name,
> phone, date and time, language and the consent statement; check-in collects
> those (no email, no message) plus the time of check-in, so this paragraph
> only explains the new place and what happens with an RSVP.
>
> The Spanish text is a draft for a qualified translator to review.
>
> Matches the code: `/e/{code}/checkin` (open 3 hours before the start to 3
> hours after the end), `app/api/enterprise/nop/events/[code]/checkin`: name,
> phone, the required consent and the optional text-message consent; matched
> by phone to an RSVP for the same event (marked checked in, nothing
> duplicated), otherwise a new request for the agent. Kept and deleted like any
> request.

## English (`#agent-pages`, after "Events")

> **Checking in at an event.** At some events, you can check in by scanning a
> code at the door. We collect your name, phone number and the time you
> checked in, with the consent statement you agreed to (and your answer to the
> optional text-message box, if it's shown). If you RSVP'd with the same phone
> number, your RSVP is marked as checked in; otherwise the agent hosting the
> event receives your check-in like any other request. It's kept and deleted
> the same way.

## Spanish (`#agent-pages-es`, after "Eventos")

> **Registro de llegada a un evento.** En algunos eventos, puede registrar su
> llegada escaneando un código en la entrada. Recopilamos su nombre, su número
> de teléfono y la hora en que registró su llegada, con la declaración de
> consentimiento que aceptó (y su respuesta a la casilla opcional de mensajes
> de texto, si aparece). Si confirmó su asistencia con el mismo número de
> teléfono, su confirmación se marca como que llegó; si no, el agente que
> organiza el evento recibe su registro como cualquier otra solicitud. Se
> guarda y se elimina de la misma manera.
