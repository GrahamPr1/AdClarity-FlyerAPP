import { LegalPage, H2, UL } from "@/app/legal/legal-page"

export const metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } }

// Written against what the code actually does, not a template. Every claim
// here is traceable: Upstash Redis (lib/store.ts), Vercel Blob
// (app/api/onboarding/upload-photo), Anthropic (lib/agent-pipeline), Resend
// (lib/email.ts), Stripe (lib/billing.ts — card entry happens only on
// Stripe-hosted Checkout and the Customer Portal; MemberBilling holds no card
// fields. The "Billing" item under What we collect lists MemberBilling,
// BillingEventSummary and DisputeRecord in lib/types.ts field by field —
// keep it in step if those change), Unsplash (lib/unsplash.ts — only the search keywords built
// by buildSearchQuery / buildSpecificSearchQuery leave the server, and the
// chosen photo is hotlinked from Unsplash's CDN, as its API guidelines
// require), the QR redeem page (app/r/[code]), and its lead form
// (app/api/leads/[code]: LeadRecord in lib/types.ts holds no IP; the IP is
// only in a one-hour rate-limit key, lib/rate-limit.ts; leads are deleted
// with the account by collectAccountKeys, and one at a time from the owner's
// dashboard or by admin).
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="10 November 2026">
      <p>
        OneFlyer is run by a small team. This page describes what we actually store and who
        actually sees it — not what a generic template says a company might do.
      </p>

      <H2>What we collect</H2>
      <UL>
        <li>
          <strong>Your account.</strong> Email address and a password. Passwords are never stored
          as text — we keep a PBKDF2-SHA256 hash, so we cannot read yours or recover it for you.
        </li>
        <li>
          <strong>What you tell us about your business.</strong> Business name, trade, services,
          target audience, phone number, and optionally an address, website and social handles.
          This is used to generate your marketing and is reused on later campaigns so you
          don&apos;t re-type it.
        </li>
        <li>
          <strong>Files you upload.</strong> Photos you add to a campaign. Stored privately and
          served through our own server rather than from a public bucket.
        </li>
        <li>
          <strong>Billing, if you pay for a plan.</strong> Your plan, billing interval (monthly or
          annual) and subscription status, including whether billing is paused or set to end;
          your billing period and renewal dates; the dates and amounts of your payments and the
          tax charged on them; the state from your billing address, not the address itself;
          counts of failed payments, refunds and disputes, and the amount, reason and status of
          any dispute; and, if you cancel in the billing portal, when you cancelled and the
          reason or feedback option you choose there (anything you type into its comment box
          stays with Stripe). We also keep Stripe&apos;s reference numbers for your customer
          record, subscription and latest payment, a record of any plan change our team makes by hand, and a
          short log of recent billing events. This is used to run your account, provide support
          and meet our tax obligations. Payment card details stay with Stripe.
        </li>
        <li>
          <strong>Your website, if you ask us to read it.</strong> The website-scan step fetches
          your public pages to pre-fill onboarding. We keep what it extracted, not a copy of your
          site.
        </li>
        <li>
          <strong>QR scan counts.</strong> For each flyer&apos;s QR code we count how many times
          its offer page was opened and how many times the call-to-action was tapped. Two numbers.
          We do not log who scanned, their IP address, their location, or their device.
        </li>
      </UL>

      <H2>Analytics</H2>
      <p>
        We use Google Analytics to see which pages people visit and where they give up, so we
        know what to fix. It sets cookies and sends Google your IP address, page URL and general
        location. We do not send it your email, your business details, or anything you type into
        the product.
      </p>
      <p>
        If you are in the UK or the EEA, analytics cookies are switched <strong>off</strong> for
        you by default — we use Google&apos;s consent mode with storage denied for those regions,
        so you are counted without being individually tracked unless you later opt in. Advertising
        and personalisation signals are switched off for <em>everyone</em>, everywhere, because
        this site runs no advertising.
      </p>
      <p>
        We also use Vercel Web Analytics, which is cookieless and does not identify individual
        visitors.
      </p>
      <p>
        Program and agent pages are different. Google Analytics and Google Tag Manager don&apos;t
        run on the agent portal (oneflyer.org/agent and /agente), on agents&apos; own pages (/p/…,
        /e/… and /a/…), or on the program administrators&apos; pages (/program). Only Vercel Web
        Analytics runs there.
      </p>

      <H2>What we don&apos;t collect</H2>
      <p>
        No advertising trackers, no ad retargeting, no selling or renting of your data to anyone,
        ever. Payments are processed by Stripe: you enter your card on Stripe&apos;s own checkout
        and billing pages, so we never see or store full card numbers.
      </p>

      <H2>Who processes it</H2>
      <UL>
        <li>
          <strong>Vercel</strong> — hosting, and file storage for uploaded photos.
        </li>
        <li>
          <strong>Upstash</strong> — the database holding your account, campaigns, counts and
          offer-page submissions.
        </li>
        <li>
          <strong>Anthropic</strong> — the AI models that write and design your campaign. Your
          business details and your promotion are sent to generate it.
        </li>
        <li>
          <strong>Resend</strong> — transactional email, such as password resets, and the email
          that tells a business about a new offer-page submission.
        </li>
        <li>
          <strong>Google Analytics</strong> — which pages get visited and where people drop off.
          See the Analytics section above for what is and isn&apos;t sent.
        </li>
        <li>
          <strong>Unsplash</strong> — stock photography. When a flyer has no photo of your own,
          we search Unsplash for a matching stock photo using up to three keywords taken from
          your business&apos;s industry, its main service and the promotion — for example
          &ldquo;roof replacement&rdquo;. We send only those keywords — never your account, contact
          or business-name details, and nothing you upload. A photo we use is shown from
          Unsplash&apos;s servers, so a browser displaying that flyer loads the image from
          Unsplash, as it would any image hosted elsewhere on the web.
        </li>
        <li>
          <strong>Higgsfield</strong> — only if you are on Pro and explicitly opt in to
          AI-generated photos. Otherwise it is never called.
        </li>
      </UL>

      <H2>Information collected on offer pages</H2>
      <p>
        Businesses that use OneFlyer can place a QR code on their printed or digital marketing.
        The QR code leads to an offer page hosted by OneFlyer. If you submit the form on an offer
        page, we collect the information you enter (your name, phone number, and optionally your
        email address and a message), along with the date and time of your submission and which
        offer it was for.
      </p>
      <p>
        <strong>Who receives it.</strong> Your information is sent to the business whose offer you
        responded to, so they can contact you about that offer. OneFlyer stores and delivers it
        on the business&apos;s behalf. We do not sell your information, share it with other
        businesses, or use it for our own marketing.
      </p>
      <p>
        <strong>How the business uses it.</strong> The business is responsible for how it contacts
        you and uses your information after it receives it. If you no longer want to hear from a
        business, contact them directly.
      </p>
      <p>
        <strong>Spam prevention.</strong> To prevent automated abuse, we temporarily use your IP
        address to limit repeated submissions. It is not stored with your submission.
      </p>
      <p>
        <strong>How long we keep it.</strong> We keep offer-page submissions until the business
        deletes them or asks us to delete its OneFlyer account, at which point they are deleted.
      </p>
      <p>
        <strong>Your choices.</strong> To request deletion of a submission you made, contact the
        business or contact us through our{" "}
        <a href="/contact" className="text-[var(--brand-teal-bright)] hover:underline">Contact page</a>{" "}
        at oneflyer.org/contact, and we will remove it.
      </p>
      <p>
        <strong>Scans.</strong> When a QR code is scanned, we count the scan so the business can
        see how its marketing performs. Scan counts are not linked to your name or contact
        details.
      </p>

      <H2 id="agent-pages">Information collected on agent pages</H2>
      <p>
        Some organizations use OneFlyer to give their agents personalized flyers and pages. This
        section covers the Neighborhood Outreach Program&apos;s agents.
      </p>
      <p>
        <strong>Scans.</strong> An agent&apos;s flyer may carry a QR code that opens a short
        OneFlyer link, which takes you to the program&apos;s enrollment page. When it&apos;s
        scanned, we count the scan for that agent. We record only that a scan happened and the
        month it happened in. We don&apos;t record who scanned it, your IP address, or your device.
      </p>
      <p>
        <strong>The contact forms.</strong> Some agents have a OneFlyer page with a form to ask
        them to contact you: the page their flyer&apos;s QR code opens, their personal page
        (oneflyer.org/p/…), or a page for an event they&apos;re hosting (oneflyer.org/e/…), where
        you can RSVP. If you submit one, we collect what you enter (your name, phone number, and
        optionally your email address and a message, plus, for an event, how many guests
        you&apos;re bringing), the date and time, the language the page was shown in, and the exact
        consent statement you agreed to by checking the box, with the agent&apos;s name as it was
        shown.
      </p>
      <p>
        <strong>Who receives it.</strong> Your request goes to the agent whose flyer or page you
        used, so they can contact you about health benefit options by phone call, text message, or
        email, as the consent statement says. We email the agent to tell them a new request has
        arrived. The program&apos;s administrator can also see agents&apos; requests and totals, to
        run the program, and authorized OneFlyer staff can see them to run and support the service.
        We don&apos;t sell your information, share it with other agents or businesses, or use it
        for our own marketing.
      </p>
      <p>
        <strong>Events.</strong> When you RSVP to an event, the agent hosting it receives your RSVP
        like any other request, and the day before the event they get an email listing everyone
        who RSVP&apos;d. If you gave your email address, we send you one reminder email the day
        before the event, in the language you used, with the time, the place and how to reach the
        agent. Replies to it go to the agent. We don&apos;t send it if the event is cancelled or
        taken down, and we don&apos;t send text messages.
      </p>
      <p>
        <strong>If an agent&apos;s account changes.</strong> Requests are kept with the agent&apos;s
        program ID rather than a personal login. If an agent&apos;s ID is reassigned or corrected,
        OneFlyer staff may move the requests to the correct ID. Every such move is recorded.
      </p>
      <p>
        <strong>How the agent uses it.</strong> The agent and the program are responsible for how
        they contact you after they receive your request. To stop hearing from them, reply STOP to
        a text, or tell the agent or the program.
      </p>
      <p>
        <strong>Spam prevention.</strong> To prevent automated abuse, we briefly use your IP
        address to limit repeated submissions. It isn&apos;t stored with your request.
      </p>
      <p>
        <strong>How long we keep it.</strong> We keep a request while the agent is active in the
        program. If the agent leaves the program, their requests are deleted automatically 12 months
        after the date they left. We delete a request sooner if you ask us to, or if the program
        asks us to.
      </p>
      <p>
        <strong>Your choices.</strong> To have a request you made deleted, contact us through our{" "}
        <a href="/contact" className="text-[var(--brand-teal-bright)] hover:underline">Contact page</a>{" "}
        at oneflyer.org/contact and we&apos;ll remove it. You can also ask the agent or the
        program. Deleting it from OneFlyer doesn&apos;t delete any copy the agent already made, for
        example in their phone or email.
      </p>

      <div lang="es" className="flex flex-col gap-4">
        <H2 id="agent-pages-es">Información recopilada en las páginas de agentes</H2>
        <p>
          Algunas organizaciones usan OneFlyer para dar a sus agentes volantes y páginas
          personalizados. Esta sección se refiere a los agentes del Neighborhood Outreach Program.
        </p>
        <p>
          <strong>Escaneos.</strong> El volante de un agente puede tener un código QR que abre un
          enlace corto de OneFlyer, que lo lleva a la página de inscripción del programa. Cuando se
          escanea, contamos el escaneo para ese agente. Solo registramos que hubo un escaneo y el
          mes en que ocurrió. No registramos quién lo escaneó, su dirección IP ni su dispositivo.
        </p>
        <p>
          <strong>Los formularios de contacto.</strong> Algunos agentes tienen una página de
          OneFlyer con un formulario para pedirles que lo contacten: la página que abre el código QR
          de su volante, su página personal (oneflyer.org/p/…) o la página de un evento que
          organizan (oneflyer.org/e/…), donde puede confirmar su asistencia. Si usted envía uno,
          recopilamos lo que escribe (su nombre, su número de teléfono y, si lo desea, su correo
          electrónico y un mensaje, y, en el caso de un evento, cuántos acompañantes llevará), la
          fecha y la hora, el idioma en que se mostró la página y la declaración de consentimiento
          exacta que aceptó al marcar la casilla, con el nombre del agente tal como se mostró.
        </p>
        <p>
          <strong>Quién la recibe.</strong> Su solicitud llega al agente cuyo volante o página usó,
          para que pueda contactarlo sobre opciones de beneficios de salud por llamada telefónica,
          mensaje de texto o correo electrónico, como indica la declaración de consentimiento. Le
          enviamos un correo al agente para avisarle que llegó una nueva solicitud. El administrador
          del programa también puede ver las solicitudes y los totales de los agentes, para
          administrar el programa, y el personal autorizado de OneFlyer puede verlas para operar el
          servicio y dar soporte. No vendemos su información, no la compartimos con otros agentes ni
          negocios, ni la usamos para nuestro propio mercadeo.
        </p>
        <p>
          <strong>Eventos.</strong> Cuando usted confirma su asistencia a un evento, el agente que
          lo organiza recibe su confirmación como cualquier otra solicitud, y el día antes del
          evento recibe un correo con la lista de todas las personas que confirmaron. Si usted dio
          su correo electrónico, le enviamos un solo correo de recordatorio el día antes del evento,
          en el idioma que usó, con la hora, el lugar y cómo comunicarse con el agente. Las
          respuestas a ese correo le llegan al agente. No lo enviamos si el evento se cancela o se
          retira, y no enviamos mensajes de texto.
        </p>
        <p>
          <strong>Si cambia la cuenta de un agente.</strong> Las solicitudes se guardan con el
          número de agente del programa, no con un inicio de sesión personal. Si el número de un
          agente se reasigna o se corrige, el personal de OneFlyer puede pasar las solicitudes al
          número correcto. Cada uno de esos cambios queda registrado.
        </p>
        <p>
          <strong>Cómo la usa el agente.</strong> El agente y el programa son responsables de cómo
          lo contactan después de recibir su solicitud. Para dejar de recibir sus mensajes, responda
          STOP a un mensaje de texto, o avísele al agente o al programa.
        </p>
        <p>
          <strong>Prevención de spam.</strong> Para evitar abusos automatizados, usamos brevemente
          su dirección IP para limitar envíos repetidos. No se guarda con su solicitud.
        </p>
        <p>
          <strong>Cuánto tiempo la guardamos.</strong> Guardamos una solicitud mientras el agente
          esté activo en el programa. Si el agente deja el programa, sus solicitudes se eliminan
          automáticamente 12 meses después de la fecha en que salió. Eliminamos una solicitud antes
          si usted nos lo pide, o si el programa nos lo pide.
        </p>
        <p>
          <strong>Sus opciones.</strong> Para que eliminemos una solicitud que usted hizo,
          comuníquese con nosotros desde nuestra{" "}
          <a href="/contact" className="text-[var(--brand-teal-bright)] hover:underline">página de contacto</a>{" "}
          en oneflyer.org/contact y la eliminaremos. También puede pedírselo al agente o al
          programa. Eliminarla de OneFlyer no elimina las copias que el agente ya haya hecho, por
          ejemplo en su teléfono o su correo.
        </p>
      </div>

      <H2 id="agent-accounts">Agent accounts</H2>
      <p>
        This section is for agents in the Neighborhood Outreach Program who have a OneFlyer account.
        The sections above on the agent pages cover the people who use your flyers and pages.
      </p>
      <p>
        <strong>When you sign up.</strong> We collect your Agent ID, full name, phone number, email
        address and preferred language. We confirm your email with a one-time code. Your sign-up
        then waits for the program&apos;s approval. If it isn&apos;t approved, your account is
        removed, but we keep a record of what you submitted and of the decision. If you sign up
        through another agent&apos;s invitation link, we record which agent invited you.
      </p>
      <p><strong>While you use your account.</strong> We keep:</p>
      <UL>
        <li>your profile: the name, phone and email you show on your flyers and pages, your language, and any name change you ask for (name changes need the program&apos;s approval);</li>
        <li>a record of every flyer you preview or download: which flyer, which format, and when;</li>
        <li>how many times your QR code was scanned, by month;</li>
        <li>your personal page settings: your booking link and, where the program allows it, the photo you upload (stored privately and shown only on your page);</li>
        <li>the events you set up, with the details you write for them;</li>
        <li>print requests you make: which flyer, how many copies, the name and address to ship them to, and any notes;</li>
        <li>the requests and RSVPs people send you (see the agent pages sections above);</li>
        <li>whether you&apos;ve turned off the monthly results email;</li>
        <li>when you last used your account.</li>
      </UL>
      <p>
        To stop automated abuse, we briefly use your IP address to limit repeated sign-in attempts.
        It isn&apos;t stored with your account. Google Analytics and Google Tag Manager don&apos;t
        run on the agent portal or on your public pages; only Vercel Web Analytics, which uses no
        cookies and doesn&apos;t identify you, does.
      </p>
      <p>
        <strong>Emails we send you.</strong> We email you your sign-in codes, the program&apos;s
        decision on your sign-up, each new request or RSVP, the day before your events, the list of
        who&apos;s coming, and a notice if an administrator takes one of your event pages down or
        puts it back. If you have Pro, we also email you a summary of last month&apos;s results on
        the 1st of each month, unless nothing happened that month; you can turn it off in your
        profile.
      </p>
      <p>
        <strong>What&apos;s public.</strong> Your name, phone number and the program&apos;s
        enrollment link, which includes your Agent ID, are printed on your flyers with your QR code.
        Some flyer versions also print your email address. If you have a personal page or an event
        page, it shows your name, phone number and email address, and your photo and booking link if
        you added them. Anything you write in an event&apos;s details is shown on its public page.
      </p>
      <p>
        <strong>Who can see your account.</strong> Authorized OneFlyer staff and the program&apos;s
        administrators can see your account details, your plan and billing status, your activity
        (flyers made, scans, requests), the requests and RSVPs you received, and your print
        requests, to quote, print and ship them. They can open a read-only view of your portal to
        help you; each time they do, it&apos;s recorded. If you invited another agent, you can see
        that agent&apos;s name, when they signed up, and whether their sign-up is waiting, approved
        or no longer active. If the program makes you a team leader, you also see, for each approved
        agent you invited, how many flyers they&apos;ve downloaded, how many requests they&apos;ve
        received, and when they last used OneFlyer: counts only, never the people who sent the
        requests. The agent who invited you sees the same about you.
      </p>
      <p>
        <strong>Billing.</strong> If you pay for Pro, you enter your card on Stripe&apos;s checkout
        and billing pages. Stripe handles your card details; we never see or store your card number.
        We keep your Stripe customer and subscription references, your subscription status, when
        your current period ends, when you last paid, and whether a payment failed.
      </p>
      <p>
        <strong>If you leave or are removed from the program.</strong> You can no longer sign in,
        your QR code takes people to the program&apos;s own page, and your personal and event pages
        come down. A paid Pro subscription ends right away, and we refund the unused part of the
        current month. Twelve months after you leave, we delete your account automatically: your
        profile, page settings and photo, events, print requests, the requests and RSVPs you
        received, and your scan counts. If the program reinstates you within that time, your account
        comes back as it was and nothing is deleted.
      </p>
      <p>
        <strong>How long we keep it.</strong> We keep your account while you&apos;re in the program,
        and for 12 months after you leave, unless you ask us to delete it sooner. After we delete an
        account, we keep the record of flyers you downloaded, because the program requires a record
        of every flyer made, and it may be given to the program. We also keep our administrative
        records: your sign-up and the program&apos;s decision on it, and the log of what OneFlyer
        staff and the program&apos;s administrators did with your account, including the deletion.
      </p>
      <p>
        <strong>Your choices.</strong> To get a copy of your information, correct it, or have it
        deleted, email <a href="mailto:support@oneflyer.org"
        className="text-[var(--brand-teal-bright)] hover:underline">support@oneflyer.org</a> from
        the address on your account. If you have a paid Pro subscription, deleting your account
        cancels it right away and we refund the unused part of the current month. You can change the
        phone number and email address you show, and your language, yourself in your portal; a name
        change goes to the program for approval.
      </p>

      <div lang="es" className="flex flex-col gap-4">
        <H2 id="agent-accounts-es">Cuentas de agentes</H2>
        <p>
          Esta sección es para los agentes del Neighborhood Outreach Program que tienen una cuenta
          de OneFlyer. Las secciones anteriores sobre las páginas de agentes se refieren a las
          personas que usan sus volantes y páginas.
        </p>
        <p>
          <strong>Cuando se registra.</strong> Recopilamos su número de agente, su nombre completo,
          su número de teléfono, su correo electrónico y su idioma preferido. Confirmamos su correo
          con un código de un solo uso. Luego su registro espera la aprobación del programa. Si no
          se aprueba, eliminamos su cuenta, pero guardamos un registro de lo que envió y de la
          decisión. Si se registra con el enlace de invitación de otro agente, registramos qué
          agente lo invitó.
        </p>
        <p><strong>Mientras usa su cuenta.</strong> Guardamos:</p>
        <UL>
          <li>su perfil: el nombre, el teléfono y el correo que muestra en sus volantes y páginas, su idioma y cualquier cambio de nombre que solicite (los cambios de nombre necesitan la aprobación del programa);</li>
          <li>un registro de cada volante que ve o descarga: qué volante, en qué formato y cuándo;</li>
          <li>cuántas veces se escaneó su código QR, por mes;</li>
          <li>la configuración de su página personal: su enlace para citas y, si el programa lo permite, la foto que suba (se guarda de forma privada y solo se muestra en su página);</li>
          <li>los eventos que organiza, con los detalles que escribe;</li>
          <li>las solicitudes de impresión que hace: qué volante, cuántas copias, el nombre y la dirección de envío, y cualquier nota;</li>
          <li>las solicitudes y confirmaciones que le envían (consulte las secciones anteriores sobre las páginas de agentes);</li>
          <li>si desactivó el correo mensual de resultados;</li>
          <li>la última vez que usó su cuenta.</li>
        </UL>
        <p>
          Para evitar abusos automatizados, usamos brevemente su dirección IP para limitar los
          intentos repetidos de iniciar sesión. No se guarda con su cuenta. Google Analytics y
          Google Tag Manager no funcionan en el portal de agentes ni en sus páginas públicas; solo
          funciona Vercel Web Analytics, que no usa cookies y no lo identifica.
        </p>
        <p>
          <strong>Correos que le enviamos.</strong> Le enviamos por correo sus códigos para iniciar
          sesión, la decisión del programa sobre su registro, cada nueva solicitud o confirmación,
          el día antes de sus eventos, la lista de quiénes asistirán, y un aviso si un administrador
          retira una de sus páginas de eventos o la vuelve a publicar. Si tiene Pro, también le
          enviamos un resumen de los resultados del mes anterior el día 1 de cada mes, salvo que ese
          mes no haya habido actividad; puede desactivarlo en su perfil.
        </p>
        <p>
          <strong>Lo que es público.</strong> Su nombre, su número de teléfono y el enlace de
          inscripción del programa, que incluye su número de agente, se imprimen en sus volantes
          junto con su código QR. Algunas versiones de los volantes también imprimen su correo
          electrónico. Si tiene una página personal o una página de evento, esta muestra su nombre,
          su número de teléfono y su correo electrónico, y su foto y su enlace para citas si los
          agregó. Todo lo que escriba en los detalles de un evento se muestra en su página pública.
        </p>
        <p>
          <strong>Quién puede ver su cuenta.</strong> El personal autorizado de OneFlyer y los
          administradores del programa pueden ver los datos de su cuenta, su plan y el estado de su
          facturación, su actividad (volantes hechos, escaneos, solicitudes), las solicitudes y
          confirmaciones que recibió, y sus solicitudes de impresión, para cotizarlas, imprimirlas y
          enviarlas. Pueden abrir una vista de solo lectura de su portal para ayudarle; cada vez que
          lo hacen, queda registrado. Si usted invitó a otro agente, puede ver el nombre de ese
          agente, cuándo se registró y si su registro está en espera, aprobado o ya no está activo.
          Si el programa lo nombra líder de equipo, también ve, de cada agente aprobado que invitó,
          cuántos volantes ha descargado, cuántas solicitudes ha recibido y cuándo usó OneFlyer por
          última vez: solo totales, nunca las personas que enviaron las solicitudes. El agente que
          lo invitó a usted ve lo mismo sobre usted.
        </p>
        <p>
          <strong>Facturación.</strong> Si paga Pro, usted escribe los datos de su tarjeta en las
          páginas de pago y facturación de Stripe. Stripe maneja los datos de su tarjeta; nosotros
          nunca vemos ni guardamos el número. Guardamos las referencias de cliente y de suscripción
          de Stripe, el estado de su suscripción, cuándo termina su período actual, cuándo pagó por
          última vez y si algún pago falló.
        </p>
        <p>
          <strong>Si deja el programa o se le retira.</strong> Ya no puede iniciar sesión, su código
          QR lleva a las personas a la página del propio programa, y su página personal y sus
          páginas de eventos dejan de estar disponibles. Una suscripción Pro pagada termina de
          inmediato, y le reembolsamos la parte no usada del mes en curso. Doce meses después de que
          salga, eliminamos su cuenta automáticamente: su perfil, la configuración y la foto de su
          página, sus eventos, sus solicitudes de impresión, las solicitudes y confirmaciones que
          recibió y sus totales de escaneos. Si el programa lo reincorpora dentro de ese plazo, su
          cuenta vuelve tal como estaba y no se elimina nada.
        </p>
        <p>
          <strong>Cuánto tiempo la guardamos.</strong> Guardamos su cuenta mientras esté en el
          programa y durante 12 meses después de que salga, a menos que nos pida eliminarla antes.
          Después de eliminar una cuenta, guardamos el registro de los volantes que descargó, porque
          el programa exige un registro de cada volante hecho, y es posible que se le entregue al
          programa. También guardamos nuestros registros administrativos: su registro en el programa
          y la decisión del programa sobre él, y el registro de lo que hicieron con su cuenta el
          personal de OneFlyer y los administradores del programa, incluida la eliminación.
        </p>
        <p>
          <strong>Sus opciones.</strong> Para obtener una copia de su información, corregirla o
          pedir que la eliminemos, escriba a <a href="mailto:support@oneflyer.org"
          className="text-[var(--brand-teal-bright)] hover:underline">support@oneflyer.org</a> desde
          el correo de su cuenta. Si tiene una suscripción Pro pagada, eliminar su cuenta la cancela
          de inmediato y le reembolsamos la parte no usada del mes en curso. Usted mismo puede
          cambiar en su portal el teléfono y el correo que muestra, y su idioma; un cambio de nombre
          pasa al programa para su aprobación.
        </p>
      </div>

      <H2>How long we keep things</H2>
      <p>
        For as long as your account exists. Pausing your account changes nothing about storage —
        it stops new campaigns, and everything you&apos;ve made stays exactly as it was. If you
        ask us to delete your account, we delete your account record, brand profile, campaigns,
        uploaded photos and QR tracking records. See the{" "}
        <a href="/refund-policy" className="text-[var(--brand-teal-bright)] hover:underline">
          Cancellation &amp; Refund Policy
        </a>{" "}
        for what that means for QR codes already printed on paper.
      </p>

      <H2>Your choices</H2>
      <p>
        Email <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">support@oneflyer.org</a> to
        get a copy of your data, correct it, or have it deleted. We&apos;ll confirm from the
        address on the account before acting on any of those.
      </p>

      <H2>Children</H2>
      <p>OneFlyer is a tool for businesses and is not directed at anyone under 18.</p>

      <H2>Changes</H2>
      <p>
        If this policy changes in a way that affects what we collect or who we send it to,
        we&apos;ll email account holders rather than quietly changing the date at the top.
      </p>
    </LegalPage>
  )
}
