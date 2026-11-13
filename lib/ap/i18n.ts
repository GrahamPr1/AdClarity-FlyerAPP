import type { ApLang } from "./types"

// Agent-facing strings for the platform, English and Spanish. Its own small
// set (NOP's strings name the program and stay NOP's). {org} is the org name.
// Spanish is a first draft: needs a native speaker's review before any org
// goes live in Spanish.

const en = {
  "join.title": "Join {org} on OneFlyer",
  "join.intro": "Sign up to get your personalized {org} flyers.",
  "signin.title": "Sign in to {org}",
  "field.externalId": "Agent ID",
  "field.name": "Name (as it prints on your flyers)",
  "field.phone": "Phone",
  "field.email": "Email",
  "field.lang": "Language",
  "field.code": "6-digit code",
  "btn.send": "Email me a code",
  "btn.verify": "Verify",
  "btn.signout": "Sign out",
  "msg.code_sent": "If that email can sign in, we sent it a 6-digit code. It expires in 15 minutes.",
  "msg.pending": "Thanks! Your sign-up is waiting for approval. We'll email you when it's approved.",
  "msg.review": "Thanks! We'll review your sign-up and email you.",
  "err.generic": "Something went wrong. Please try again.",
  "err.wrong_code": "That code isn't right. Check it and try again.",
  "err.expired": "That code has expired. Start again.",
  "err.too_many": "Too many tries. Start again.",
  "err.daily_limit": "Too many codes sent to this email today. Try again tomorrow.",
  "portal.title": "Your {org} agent portal",
  "portal.agent_id": "Agent ID",
  "portal.enroll_link": "Your enrollment link",
  "portal.qr_link": "Your QR link",
  "portal.recruit_link": "Your recruit link",
  "portal.flyers": "Flyers",
  "portal.flyers_pending": "Your flyers will appear here once {org}'s flyers are approved.",
  "portal.not_active": "Your account isn't active right now.",
  "portal.proof": "These are PROOFS: your organization hasn't approved its flyers yet. Don't print or share them.",
  "portal.letter_pdf": "PDF (Letter)",
  "portal.bleed_pdf": "PDF for print shops (bleed)",
  "portal.with_prices": "with prices",
  "portal.no_prices": "without prices",
  "have_account": "Already signed up? Sign in",
  "need_account": "New here? Sign up",
  "email.subject": "Your {org} sign-in code: {code}",
  "email.body": "Your code is {code}. It expires in 15 minutes. If you didn't ask for it, ignore this email.",
} as const

export type ApStringKey = keyof typeof en

const es: Record<ApStringKey, string> = {
  "join.title": "Únase a {org} en OneFlyer",
  "join.intro": "Regístrese para obtener sus volantes personalizados de {org}.",
  "signin.title": "Inicie sesión en {org}",
  "field.externalId": "ID de agente",
  "field.name": "Nombre (tal como aparece en sus volantes)",
  "field.phone": "Teléfono",
  "field.email": "Correo electrónico",
  "field.lang": "Idioma",
  "field.code": "Código de 6 dígitos",
  "btn.send": "Enviarme un código",
  "btn.verify": "Verificar",
  "btn.signout": "Cerrar sesión",
  "msg.code_sent": "Si ese correo puede iniciar sesión, le enviamos un código de 6 dígitos. Vence en 15 minutos.",
  "msg.pending": "¡Gracias! Su registro está pendiente de aprobación. Le avisaremos por correo cuando se apruebe.",
  "msg.review": "¡Gracias! Revisaremos su registro y le escribiremos.",
  "err.generic": "Algo salió mal. Inténtelo de nuevo.",
  "err.wrong_code": "Ese código no es correcto. Revíselo e inténtelo de nuevo.",
  "err.expired": "Ese código venció. Empiece de nuevo.",
  "err.too_many": "Demasiados intentos. Empiece de nuevo.",
  "err.daily_limit": "Se enviaron demasiados códigos a este correo hoy. Inténtelo mañana.",
  "portal.title": "Su portal de agente de {org}",
  "portal.agent_id": "ID de agente",
  "portal.enroll_link": "Su enlace de inscripción",
  "portal.qr_link": "Su enlace QR",
  "portal.recruit_link": "Su enlace para reclutar",
  "portal.flyers": "Volantes",
  "portal.flyers_pending": "Sus volantes aparecerán aquí cuando se aprueben los volantes de {org}.",
  "portal.not_active": "Su cuenta no está activa en este momento.",
  "portal.proof": "Estas son PRUEBAS: su organización aún no ha aprobado sus volantes. No las imprima ni las comparta.",
  "portal.letter_pdf": "PDF (carta)",
  "portal.bleed_pdf": "PDF para imprenta (con sangrado)",
  "portal.with_prices": "con precios",
  "portal.no_prices": "sin precios",
  "have_account": "¿Ya se registró? Inicie sesión",
  "need_account": "¿Es nuevo? Regístrese",
  "email.subject": "Su código de {org}: {code}",
  "email.body": "Su código es {code}. Vence en 15 minutos. Si no lo pidió, ignore este correo.",
}

const DICTS: Record<ApLang, Record<ApStringKey, string>> = { en, es }

export function tAp(lang: ApLang, key: ApStringKey, vars: Record<string, string> = {}): string {
  return DICTS[lang][key].replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
}

export function apDict(lang: ApLang, vars: Record<string, string>): Record<ApStringKey, string> {
  return Object.fromEntries((Object.keys(en) as ApStringKey[]).map((k) => [k, tAp(lang, k, vars)])) as Record<ApStringKey, string>
}
