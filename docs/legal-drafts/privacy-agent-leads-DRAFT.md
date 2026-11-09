# DRAFT — Privacy Policy: agent pages (English and Spanish)

> **Status: APPROVED and published in `app/privacy/page.tsx` (9 November 2026),
> English and Spanish, with the deletion job live. This file is the record;
> the page is the source of truth.**
>
> Publish both versions together, in the deploy that makes lead capture live:
> the same deploy switches the 12-month deletion job from dry run to live
> (`NOP_RETENTION_LIVE=on`), because this text promises the deletion. After
> it's published, the program's consent text can be entered in admin; its
> "Privacy Policy" / "Política de Privacidad" links to the sections below
> (`/privacy#agent-pages` and `/privacy#agent-pages-es`).
>
> The Spanish text is a draft for a qualified translator to review; it is not a
> reviewed translation.
>
> Wording drafted by an engineer, not legal advice. Every claim matches the
> code: scans (`lib/enterprise/portal/agent-data.ts`), the forms
> (`app/api/enterprise/nop/leads/[code]`), who sees leads (agent, OneFlyer admin,
> program admin), deletion (`lib/enterprise/portal/retention-job.ts`).

Placement: a new section after **"Information collected on offer pages"**,
English (`id="agent-pages"`) then Spanish (`id="agent-pages-es"`, `lang="es"`).

---

## Information collected on agent pages {#agent-pages}

Some organizations use OneFlyer to give their agents personalized flyers and
pages. This section covers the Neighborhood Outreach Program's agents.

**Scans.** An agent's flyer may carry a QR code that opens a short OneFlyer
link, which takes you to the program's enrollment page. When it's scanned, we
count the scan for that agent. We record only that a scan happened and the
month it happened in. We don't record who scanned it, your IP address, or your
device.

**The contact forms.** Some agents have a OneFlyer page with a form to ask them
to contact you: either the page their flyer's QR code opens, or their personal
page (oneflyer.org/p/…). If you submit one, we collect what you enter (your
name, phone number, and optionally your email address and a message), the date
and time, the language the page was shown in, and the exact consent statement
you agreed to by checking the box, with the agent's name as it was shown.

**Who receives it.** Your request goes to the agent whose flyer or page you
used, so they can contact you about health benefit options by phone call, text
message, or email, as the consent statement says. We email the agent to tell
them a new request has arrived. The program's administrator can also see
agents' requests and totals, to run the program, and authorized OneFlyer staff
can see them to run and support the service. We don't sell your information,
share it with other agents or businesses, or use it for our own marketing.

**If an agent's account changes.** Requests are kept with the agent's program
ID rather than a personal login. If an agent's ID is reassigned or corrected,
OneFlyer staff may move the requests to the correct ID. Every such move is
recorded.

**How the agent uses it.** The agent and the program are responsible for how
they contact you after they receive your request. To stop hearing from them,
reply STOP to a text, or tell the agent or the program.

**Spam prevention.** To prevent automated abuse, we briefly use your IP address
to limit repeated submissions. It isn't stored with your request.

**How long we keep it.** We keep a request while the agent is active in the
program. If the agent leaves the program, their requests are deleted
automatically 12 months after the date they left. We delete a request sooner if
you ask us to, or if the program asks us to.

**Your choices.** To have a request you made deleted, contact us through our
[Contact page](/contact) at oneflyer.org/contact and we'll remove it. You can
also ask the agent or the program. Deleting it from OneFlyer doesn't delete any
copy the agent already made, for example in their phone or email.

---

## Información recopilada en las páginas de agentes {#agent-pages-es}

*(Borrador para revisión por un traductor calificado.)*

Algunas organizaciones usan OneFlyer para dar a sus agentes volantes y páginas
personalizados. Esta sección se refiere a los agentes del Neighborhood Outreach
Program.

**Escaneos.** El volante de un agente puede tener un código QR que abre un
enlace corto de OneFlyer, que lo lleva a la página de inscripción del programa.
Cuando se escanea, contamos el escaneo para ese agente. Solo registramos que
hubo un escaneo y el mes en que ocurrió. No registramos quién lo escaneó, su
dirección IP ni su dispositivo.

**Los formularios de contacto.** Algunos agentes tienen una página de OneFlyer
con un formulario para pedirles que lo contacten: la página que abre el código
QR de su volante, o su página personal (oneflyer.org/p/…). Si usted envía uno,
recopilamos lo que escribe (su nombre, su número de teléfono y, si lo desea, su
correo electrónico y un mensaje), la fecha y la hora, el idioma en que se
mostró la página y la declaración de consentimiento exacta que aceptó al marcar
la casilla, con el nombre del agente tal como se mostró.

**Quién la recibe.** Su solicitud llega al agente cuyo volante o página usó,
para que pueda contactarlo sobre opciones de beneficios de salud por llamada
telefónica, mensaje de texto o correo electrónico, como indica la declaración
de consentimiento. Le enviamos un correo al agente para avisarle que llegó una
nueva solicitud. El administrador del programa también puede ver las
solicitudes y los totales de los agentes, para administrar el programa, y el
personal autorizado de OneFlyer puede verlas para operar el servicio y dar
soporte. No vendemos su información, no la compartimos con otros agentes ni
negocios, ni la usamos para nuestro propio mercadeo.

**Si cambia la cuenta de un agente.** Las solicitudes se guardan con el número
de agente del programa, no con un inicio de sesión personal. Si el número de un
agente se reasigna o se corrige, el personal de OneFlyer puede pasar las
solicitudes al número correcto. Cada uno de esos cambios queda registrado.

**Cómo la usa el agente.** El agente y el programa son responsables de cómo lo
contactan después de recibir su solicitud. Para dejar de recibir sus mensajes,
responda STOP a un mensaje de texto, o avísele al agente o al programa.

**Prevención de spam.** Para evitar abusos automatizados, usamos brevemente su
dirección IP para limitar envíos repetidos. No se guarda con su solicitud.

**Cuánto tiempo la guardamos.** Guardamos una solicitud mientras el agente esté
activo en el programa. Si el agente deja el programa, sus solicitudes se
eliminan automáticamente 12 meses después de la fecha en que salió. Eliminamos
una solicitud antes si usted nos lo pide, o si el programa nos lo pide.

**Sus opciones.** Para que eliminemos una solicitud que usted hizo,
comuníquese con nosotros desde nuestra [página de contacto](/contact) en
oneflyer.org/contact y la eliminaremos. También puede pedírselo al agente o al
programa. Eliminarla de OneFlyer no elimina las copias que el agente ya haya
hecho, por ejemplo en su teléfono o su correo.

---

## Decided

1. **Retention.** Leads are kept while the agent is active; deleted 12 months
   after the agent is terminated or removed from the roster. The daily job is
   built and runs as a dry run until `NOP_RETENTION_LIVE=on`, set in the same
   deploy that publishes this text.
2. **"Left the program."** Only terminated, or removed from the roster, starts
   the clock. Suspended and pending don't. *Gap:* self-signed-up agents can only
   be terminated through a roster import today; there's no admin "remove" or
   "terminate" button yet.
3. **Who can see requests.** The agent, OneFlyer admins, and the program admin
   (requests and totals).
4. **Consent wording.** The program's approved statement, shown verbatim with
   the agent's name filled in and stored with each request.
5. **Spanish.** Published together with the English, after a qualified
   translator's review.
