# DRAFT — Terms and Refund Policy: agent Pro billing

> **Status: final text for review. Nothing on the live pages has been changed.**
> `app/terms/page.tsx` and `app/refund-policy/page.tsx` are untouched. Publish
> these additions (English and Spanish) in the same deploy that turns on live
> agent billing (live price, live webhook, live portal configuration). Not
> before: the pages would describe charges that can't happen yet.
>
> Decisions applied: refunds match SMB monthly plans (cancel anytime, Pro
> until the end of the paid period, no partial refunds); the liability cap is
> the same as SMB's; agents get a Spanish version. The Spanish text below needs
> review by a qualified translator before publishing; it is not a reviewed
> translation.
>
> Wording drafted by an engineer, not legal advice. Every claim matches the
> code in `lib/enterprise/portal/agent-billing.ts`.

---

## English

### Terms of Service — new section, after "Plans and limits"

#### Neighborhood Outreach Program agents

If you joined OneFlyer as an agent of the Neighborhood Outreach Program, these
points apply to your agent account in addition to the rest of these terms.

**Approval.** Agent accounts are reviewed before they can be used. Until your
sign-up is approved you can't download flyers or buy Pro.

**Basic and Pro.** Basic is free and includes the program's flyers. Pro adds
the agent tools shown in your portal, such as your leads. Pro costs **$40 per
month**, billed in advance through Stripe. The price is shown before tax; any
sales tax that applies where you are is calculated from your billing address
and shown at checkout before you pay. Pro is paid by card. We never see or
store your full card number — Stripe holds it.

**Renewal.** Pro renews automatically every month at the current price until
you cancel. If we change the price, we'll email you at least 30 days before it
applies to you.

**Cancelling.** Cancel anytime from your agent portal → Manage billing. You
keep Pro until the end of the month you've already paid for; then your account
moves to Basic. Your leads and history stay.

**If a payment fails.** We retry it, and you keep Pro while we do. If it still
can't be collected, your account moves to Basic. Your leads and history stay,
and you can subscribe again any time.

**If you're removed from the program.** If you're removed from the program,
your Pro plan ends right away and we refund the unused part of that month.

**Pro set by the program.** The program may give you Pro without you paying
for it. That Pro is managed by the program, not by your card, and these
billing terms don't apply to it.

**Leader.** The Leader tier isn't for sale; the program assigns it.

The "Limits of liability" section applies to agent accounts as written.

### Cancellation & Refund Policy — new section, after "Refunds"

#### Agent Pro (Neighborhood Outreach Program agents)

- **Cancelling.** No contract or notice period. Cancel online from your agent
  portal → Manage billing. Pro lasts until the end of the month you've paid
  for, then your account moves to Basic and doesn't renew.
- **Refunds.** We don't refund a partial month. If the product failed to
  deliver what you paid for, email support@oneflyer.org and we'll refund you.
- **Removed from the program.** If you're removed from the program, your Pro
  plan ends right away and we refund the unused part of that month.
- **What you keep.** Your leads, scan counts and flyers stay. Lead requests are
  kept and deleted as the Privacy Policy describes.
- **Your QR codes.** Flyers you've already printed keep working whatever your
  plan: the QR code follows your status in the program, not your billing.

---

## Español (pendiente de revisión por un traductor calificado)

### Términos del servicio — nueva sección, después de "Planes y límites"

#### Agentes del Neighborhood Outreach Program

Si usted se unió a OneFlyer como agente del Neighborhood Outreach Program, estos
puntos se aplican a su cuenta de agente, además del resto de estos términos.

**Aprobación.** Las cuentas de agente se revisan antes de poder usarse. Hasta
que su registro sea aprobado, no puede descargar volantes ni comprar Pro.

**Básico y Pro.** Básico es gratuito e incluye los volantes del programa. Pro
agrega las herramientas para agentes que aparecen en su portal, como sus
contactos. Pro cuesta **$40 al mes**, cobrados por adelantado a través de
Stripe. El precio se muestra antes de impuestos; cualquier impuesto sobre las
ventas que corresponda donde usted se encuentre se calcula según su dirección
de facturación y se muestra en el pago antes de que pague. Pro se paga con
tarjeta. Nunca vemos ni guardamos el número completo de su tarjeta; lo guarda
Stripe.

**Renovación.** Pro se renueva automáticamente cada mes al precio vigente hasta
que usted lo cancele. Si cambiamos el precio, le avisaremos por correo
electrónico al menos 30 días antes de que se le aplique.

**Cancelación.** Cancele en cualquier momento desde su portal de agente →
Administrar facturación. Conserva Pro hasta el final del mes que ya pagó;
después, su cuenta pasa a Básico. Sus contactos y su historial se conservan.

**Si un pago falla.** Volvemos a intentarlo y usted conserva Pro mientras
tanto. Si aun así no se puede cobrar, su cuenta pasa a Básico. Sus contactos y
su historial se conservan, y puede volver a suscribirse en cualquier momento.

**Si lo retiran del programa.** Si lo retiran del programa, su plan Pro termina
de inmediato y le reembolsamos la parte no usada de ese mes.

**Pro asignado por el programa.** El programa puede darle Pro sin que usted lo
pague. Ese Pro lo administra el programa, no su tarjeta, y estos términos de
facturación no se le aplican.

**Leader.** El nivel Leader no está a la venta; lo asigna el programa.

La sección "Límites de responsabilidad" se aplica a las cuentas de agente tal
como está escrita.

### Política de cancelación y reembolso — nueva sección, después de "Reembolsos"

#### Pro para agentes (agentes del Neighborhood Outreach Program)

- **Cancelación.** Sin contrato ni plazo de aviso. Cancele en línea desde su
  portal de agente → Administrar facturación. Pro dura hasta el final del mes
  que pagó; después, su cuenta pasa a Básico y no se renueva.
- **Reembolsos.** No reembolsamos meses parciales. Si el producto no cumplió con
  lo que usted pagó, escriba a support@oneflyer.org y le haremos el reembolso.
- **Si lo retiran del programa.** Si lo retiran del programa, su plan Pro termina
  de inmediato y le reembolsamos la parte no usada de ese mes.
- **Lo que conserva.** Sus contactos, sus escaneos y sus volantes se conservan.
  Las solicitudes de contacto se guardan y se eliminan como lo describe la
  Política de Privacidad.
- **Sus códigos QR.** Los volantes que ya imprimió siguen funcionando sin
  importar su plan: el código QR sigue su estado en el programa, no su
  facturación.

---

## Placement (decided)

Each page gets the English section, then the Spanish one, with its own anchor
and `lang="es"`, the same as the privacy policy:

- Terms: `#agents` (English), `#agents-es` (Spanish).
- Refund policy: `#agent-pro` (English), `#agent-pro-es` (Spanish).

## Before publishing

- Spanish: review by a qualified translator (not a machine translation).
- Publish in the billing go-live deploy, not before.
- The removal refund is built: Remove from program cancels a paid Pro
  subscription immediately and refunds the unused part of the month, prorated
  by time (`endAgentProOnRemoval` in `lib/enterprise/portal/agent-billing.ts`).
