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
