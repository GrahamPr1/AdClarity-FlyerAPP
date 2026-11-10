# DRAFT — Privacy Policy: Analytics and the Meta Pixel (before / after)

> **Status: DRAFT, not published.** The business site keeps Google Analytics and
> the Meta Pixel (loaded by Google Tag Manager, container GTM-TLBKNZHK); agent
> and program pages use neither (`lib/offer-page.ts` isUntrackedPath). The
> Analytics, "What we don't collect" and "Who processes it" sections are
> English-only on the page; the Agent accounts section has an English and a
> Spanish sentence about analytics, both updated below.
>
> Wording drafted by an engineer, not legal advice.

## Owner to confirm before publishing (not visible in the code)

The Meta tag is configured inside the GTM container, not in the code, so these
can only be checked in GTM / Meta Events Manager:

1. **Which events Meta receives.** The site pushes page views and these events
   to GTM: sign-up started/completed, onboarding and campaign steps,
   begin_checkout, and purchase (`lib/analytics.ts`). The text below says Meta
   gets visits "and actions such as signing up or starting a subscription".
   If the container sends Meta only page views, say so and I'll narrow it.
2. **Automatic advanced matching** (Events Manager → Settings). If it's on, the
   pixel can read the email typed into the sign-up and login forms and send it
   to Meta hashed. If it's on, the text must say so (sentence in brackets
   below); if it's off, drop that sentence.
3. **Consent in the UK and EEA.** Google's tags start with storage denied there
   (code). Whether the Meta tag waits for consent depends on the GTM trigger.
   The text below claims nothing about Meta and consent; if the Meta tag is
   gated on consent, I'll add that.
4. **Retargeting / custom audiences.** The text says we use the pixel to
   measure our ads. If you also build audiences from site visitors to show
   them ads (retargeting), the text must say that too (sentence in brackets).

---

## 1. Analytics section

### Before (as published)

> We use Google Analytics to see which pages people visit and where they give
> up, so we know what to fix. It sets cookies and sends Google your IP address,
> page URL and general location. We do not send it your email, your business
> details, or anything you type into the product.
>
> If you are in the UK or the EEA, analytics cookies are switched **off** for
> you by default — we use Google's consent mode with storage denied for those
> regions, so you are counted without being individually tracked unless you
> later opt in. Advertising and personalisation signals are switched off for
> *everyone*, everywhere, because this site runs no advertising.
>
> We also use Vercel Web Analytics, which is cookieless and does not identify
> individual visitors.
>
> Program and agent pages are different. Google Analytics and Google Tag
> Manager don't run on the agent portal (oneflyer.org/agent and /agente), on
> agents' own pages (/p/…, /e/… and /a/…), or on the program administrators'
> pages (/program). Only Vercel Web Analytics runs there.

### After

> On OneFlyer's own website (every page except the program, agent and offer
> pages listed below), we use two tools to understand visits and measure our
> ads:
>
> - **Google Analytics**, to see which pages people visit and where they give
>   up, so we know what to fix. It sets cookies and sends Google your IP
>   address, page URL and general location.
> - **The Meta Pixel**, to measure how our ads on Facebook and Instagram
>   perform, for example whether someone who saw an ad later visited the site
>   or signed up. It sets cookies and sends Meta your IP address, the pages you
>   visit, your browser and device, and actions such as signing up or starting
>   a subscription. Meta may connect this with your Facebook or Instagram
>   account if you have one. [If automatic advanced matching is on: When you
>   type your email address into our sign-up or sign-in form, the pixel may
>   send it to Meta in a scrambled (hashed) form so Meta can match the visit
>   to your account.] [If you use audiences: We may also use these visits to
>   show our ads to people who have visited the site.]
>
> We don't send either tool your business details or anything you type into
> the product.
>
> If you are in the UK or the EEA, Google Analytics cookies are switched
> **off** for you by default — we use Google's consent mode with storage
> denied for those regions, so you are counted without being individually
> tracked unless you later opt in. Google's advertising and personalisation
> signals are switched off for everyone.
>
> We also use Vercel Web Analytics, which is cookieless and does not identify
> individual visitors.
>
> Program and agent pages are different. Google Analytics, Google Tag Manager
> and the Meta Pixel don't run on the agent portal (oneflyer.org/agent and
> /agente), on agents' own pages (/p/…, /e/… and /a/…), on businesses' offer
> pages (/r/…), or on the program administrators' pages (/program). Only
> Vercel Web Analytics runs there, except on offer pages, which run none.

## 2. "What we don't collect"

### Before

> No advertising trackers, no ad retargeting, no selling or renting of your
> data to anyone, ever. Payments are processed by Stripe: you enter your card
> on Stripe's own checkout and billing pages, so we never see or store full
> card numbers.

### After

> We never sell or rent your data to anyone. The only advertising tool we use
> is the Meta Pixel on OneFlyer's own website, described above. Payments are
> processed by Stripe: you enter your card on Stripe's own checkout and billing
> pages, so we never see or store full card numbers.

(If you use retargeting audiences, nothing else changes here; if you don't, it
can say "We don't use it to show you ads elsewhere.")

## 3. "Who processes it": add after Google Analytics

> **Meta** — the Meta Pixel on OneFlyer's own website, to measure our ads on
> Facebook and Instagram. See the Analytics section above for what it
> receives.

## 4. Agent accounts: the analytics sentence

### Before (EN)

> Google Analytics and Google Tag Manager don't run on the agent portal or on
> your public pages; only Vercel Web Analytics, which uses no cookies and
> doesn't identify you, does.

### After (EN)

> Google Analytics, Google Tag Manager and the Meta Pixel don't run on the
> agent portal or on your public pages; only Vercel Web Analytics, which uses
> no cookies and doesn't identify you, does.

### Before (ES)

> Google Analytics y Google Tag Manager no funcionan en el portal de agentes ni
> en sus páginas públicas; solo funciona Vercel Web Analytics, que no usa
> cookies y no lo identifica.

### After (ES)

> Google Analytics, Google Tag Manager y el píxel de Meta no funcionan en el
> portal de agentes ni en sus páginas públicas; solo funciona Vercel Web
> Analytics, que no usa cookies y no lo identifica.

## 5. Agent accounts: records after a deletion (decision 3)

### Before (EN)

> We also keep our administrative records: your sign-up and the program's
> decision on it, and the log of what OneFlyer staff and the program's
> administrators did with your account, including the deletion.

### After (EN)

> We also keep our administrative records of what happened, with your name,
> phone number and email address removed: your Agent ID, the dates, who acted,
> and what they did (for example, your sign-up and the program's decision on
> it, and the deletion itself).

### Before (ES)

> También guardamos nuestros registros administrativos: su registro en el
> programa y la decisión del programa sobre él, y el registro de lo que
> hicieron con su cuenta el personal de OneFlyer y los administradores del
> programa, incluida la eliminación.

### After (ES)

> También guardamos nuestros registros administrativos de lo que ocurrió, sin
> su nombre, su número de teléfono ni su correo electrónico: su número de
> agente, las fechas, quién actuó y qué hizo (por ejemplo, su registro en el
> programa, la decisión del programa sobre él y la propia eliminación).
