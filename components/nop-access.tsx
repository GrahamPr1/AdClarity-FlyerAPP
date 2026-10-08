"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useNop } from "@/components/nop-i18n"
import { DisplayInputs, Field, field, post, primary, secondary, type Display } from "@/components/nop-agent"

// Passwordless agent access: "Get started" (Agent ID + email -> code ->
// confirm) and "Sign in" (email -> code). Each server route is the
// authority; this only shows what it returns.

const COOLDOWN_S = 60

function ErrorLine({ message }: { message: string | null }) {
  // role=alert: announced as soon as it appears.
  return message ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{message}</p> : null
}

/**
 * The 6-digit code field: number pad, one-time-code autofill, and paste of
 * the whole code (spaces, dashes or "Your code is 123456" all work). Fills
 * itself and submits once 6 digits are in. "Resend code" with a cooldown.
 */
function CodeStep({
  intro,
  onVerify,
  onResend,
  secondaryAction,
}: {
  intro: string
  onVerify: (code: string) => Promise<string | null>
  onResend: () => Promise<{ error: string | null }>
  secondaryAction: React.ReactNode
}) {
  const { t } = useNop()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wait, setWait] = useState(COOLDOWN_S)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  async function submit(value: string) {
    if (busy || value.length !== 6) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const err = await onVerify(value)
    setBusy(false)
    if (err) {
      setError(err)
      setCode("")
      input.current?.focus()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(code)
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">{intro}</p>
      <Field id="code" label={t("reg.code_label")}>
        <input
          ref={input}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          aria-describedby="code-hint"
          aria-invalid={error ? true : undefined}
          className={`${field} text-lg tracking-[0.4em]`}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
            setCode(digits)
            if (digits.length === 6) void submit(digits)
          }}
          onPaste={(e) => {
            const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(-6)
            if (digits.length === 6) {
              e.preventDefault()
              setCode(digits)
              void submit(digits)
            }
          }}
        />
      </Field>
      <p id="code-hint" className="-mt-2 text-xs text-muted-foreground">{t("code.paste_hint")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || code.length !== 6} className={primary}>
          {busy ? t("reg.checking") : t("reg.verify")}
        </button>
        <button
          type="button"
          disabled={wait > 0 || busy}
          className={secondary}
          onClick={async () => {
            setError(null)
            setNotice(null)
            const r = await onResend()
            if (r.error) setError(r.error)
            else {
              setNotice(t("code.resent"))
              setWait(COOLDOWN_S)
              setCode("")
              input.current?.focus()
            }
          }}
        >
          {wait > 0 ? t("code.resend_wait", { s: wait }) : t("code.resend")}
        </button>
        {secondaryAction}
      </div>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <ErrorLine message={error} />
    </form>
  )
}

type StartStep =
  | { name: "id" }
  | { name: "code"; sentTo: string }
  | { name: "confirm"; agentId: string; agentName: string; display: Display }

/** "First time? Get started": Agent ID + email -> code -> confirm. No password, no separate sign-up. */
export function NopGetStarted() {
  const { t, rich } = useNop()
  const router = useRouter()
  const [step, setStep] = useState<StartStep>({ name: "id" })
  const [agentId, setAgentId] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string; signIn?: boolean } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const restart = () => {
    setStep({ name: "id" })
    setError(null)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {step.name === "id" && (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const { ok, data } = await post("/api/enterprise/nop/access/start", { agentId, email }).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            setBusy(false)
            if (!ok) return setError({ message: data.message ?? t("common.generic"), field: data.field, signIn: data.error === "already_registered" })
            setStep({ name: "code", sentTo: data.sentTo })
          }}
        >
          <Field id="agentId" label={t("reg.id_label")} error={error?.field === "agentId" ? error.message : undefined}>
            <input id="agentId" name="agentId" inputMode="numeric" autoComplete="off" className={field} value={agentId}
              aria-invalid={error?.field === "agentId" ? true : undefined}
              onChange={(e) => setAgentId(e.target.value)} placeholder={t("reg.id_placeholder")} />
          </Field>
          <Field id="email" label={t("start.email_label")} error={error?.field === "email" ? error.message : undefined}>
            <input id="email" name="email" type="email" autoComplete="email" className={field} value={email}
              aria-invalid={error?.field === "email" ? true : undefined}
              onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button type="submit" disabled={busy || !agentId.trim() || !email.trim()} className={primary}>
            {busy ? t("reg.sending") : t("reg.send_code")}
          </button>
          {error && !error.field && (
            <div className="flex flex-col gap-2">
              <ErrorLine message={error.message} />
              {error.signIn && <Link href="/agent/sign-in" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">{t("agent.sign_in")}</Link>}
            </div>
          )}
          <Link href="/agent/sign-in" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{t("agent.sign_in")}</Link>
        </form>
      )}

      {step.name === "code" && (
        <CodeStep
          intro={t("reg.code_sent_to", { sentTo: step.sentTo })}
          onVerify={async (code) => {
            const { ok, data } = await post("/api/enterprise/nop/access/verify", { code }).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            if (!ok) {
              if (["too_many_attempts", "no_registration"].includes(data.error)) {
                setStep({ name: "id" })
                setError({ message: data.message ?? t("common.generic") })
                return null
              }
              return data.message ?? t("common.generic")
            }
            setStep({ name: "confirm", agentId: data.agentId, agentName: data.agentName, display: data.defaults })
            return null
          }}
          onResend={async () => {
            const { ok, data } = await post("/api/enterprise/nop/access/resend", {}).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            if (!ok && ["resend_limit", "no_registration"].includes(data.error)) {
              setStep({ name: "id" })
              setError({ message: data.message })
              return { error: null }
            }
            return { error: ok ? null : data.message ?? t("common.generic") }
          }}
          secondaryAction={<button type="button" onClick={restart} className={secondary}>{t("reg.start_over")}</button>}
        />
      )}

      {step.name === "confirm" && (
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            setFieldErrors({})
            const { ok, data } = await post("/api/enterprise/nop/access/confirm", step.display).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            if (!ok) {
              setBusy(false)
              if (data.fields) return setFieldErrors(data.fields)
              setStep({ name: "id" })
              return setError({ message: data.message ?? t("common.generic") })
            }
            router.replace(data.redirect ?? "/enterprise/nop/dashboard")
          }}
        >
          <p data-testid="nop-confirm" className="rounded-lg border border-border bg-[var(--surface-soft)] p-4 text-sm">
            {rich("reg.confirm_line", {
              name: <span className="font-semibold">{step.agentName}</span>,
              agentId: <span className="font-semibold">{step.agentId}</span>,
            })}
          </p>
          <p className="text-sm text-muted-foreground">{t("reg.confirm_help")}</p>
          <DisplayInputs value={step.display} onChange={(display) => setStep({ ...step, display })} errors={fieldErrors} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primary}>{busy ? t("reg.registering") : t("reg.confirm_submit")}</button>
            <button type="button" onClick={restart} className={secondary}>{t("reg.not_me")}</button>
          </div>
        </form>
      )}

      {step.name !== "id" && error && <div className="mt-4"><ErrorLine message={error.message} /></div>}
    </div>
  )
}

/** "Already registered? Sign in": email -> code -> agent dashboard. */
export function NopSignIn() {
  const { t } = useNop()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {!sent ? (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const { ok, data } = await post("/api/enterprise/nop/access/signin", { email }).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            setBusy(false)
            if (!ok) return setError({ message: data.message ?? t("common.generic"), field: data.field })
            setSent(email.trim())
          }}
        >
          <Field id="email" label={t("signin.email_label")} error={error?.field === "email" ? error.message : undefined}>
            <input id="email" name="email" type="email" autoComplete="email" className={field} value={email}
              aria-invalid={error?.field === "email" ? true : undefined}
              onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button type="submit" disabled={busy || !email.trim()} className={primary}>
            {busy ? t("reg.sending") : t("reg.send_code")}
          </button>
          {error && !error.field && <ErrorLine message={error.message} />}
          <div className="flex flex-col text-sm">
            <Link href="/agent/start" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">{t("agent.get_started")}</Link>
            <Link href="/login?next=/enterprise/nop/dashboard" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">{t("signin.password_option")}</Link>
          </div>
        </form>
      ) : (
        <CodeStep
          intro={t("signin.sent_neutral", { email: sent })}
          onVerify={async (code) => {
            const { ok, data } = await post("/api/enterprise/nop/access/verify", { code }).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            if (!ok) {
              if (["too_many_attempts", "no_registration"].includes(data.error)) {
                setSent(null)
                setError({ message: data.message ?? t("common.generic") })
                return null
              }
              return data.message ?? t("common.generic")
            }
            router.replace(data.redirect ?? "/enterprise/nop/dashboard")
            return null
          }}
          onResend={async () => {
            const { ok, data } = await post("/api/enterprise/nop/access/resend", {}).catch(() => ({ ok: false, data: { message: t("common.network") } }))
            if (!ok && ["resend_limit", "no_registration"].includes(data.error)) {
              setSent(null)
              setError({ message: data.message })
              return { error: null }
            }
            return { error: ok ? null : data.message ?? t("common.generic") }
          }}
          secondaryAction={<button type="button" onClick={() => { setSent(null); setError(null) }} className={secondary}>{t("code.other_email")}</button>}
        />
      )}
    </div>
  )
}
