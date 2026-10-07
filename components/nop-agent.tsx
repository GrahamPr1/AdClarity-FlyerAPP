"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useNop } from "@/components/nop-i18n"

const field =
  "w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
const primary =
  "whitespace-nowrap rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors"
const secondary =
  "whitespace-nowrap rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"

type Display = { displayName: string; displayPhone: string; displayEmail: string }

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

function Field({ id, label, children, error }: { id: string; label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function DisplayInputs({ value, onChange, errors }: { value: Display; onChange: (v: Display) => void; errors: Record<string, string> }) {
  const { t } = useNop()
  return (
    <div className="flex flex-col gap-4">
      <Field id="displayName" label={t("display.name")} error={errors.displayName}>
        <input id="displayName" className={field} value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value })} />
      </Field>
      <Field id="displayPhone" label={t("display.phone")} error={errors.displayPhone}>
        <input id="displayPhone" type="tel" inputMode="tel" className={field} placeholder={t("display.phone_placeholder")}
          value={value.displayPhone} onChange={(e) => onChange({ ...value, displayPhone: e.target.value })} />
      </Field>
      <Field id="displayEmail" label={t("display.email")} error={errors.displayEmail}>
        <input id="displayEmail" type="email" className={field} value={value.displayEmail} onChange={(e) => onChange({ ...value, displayEmail: e.target.value })} />
      </Field>
    </div>
  )
}

type Step =
  | { name: "loading" }
  | { name: "id" }
  | { name: "email"; agentId: string }
  | { name: "code"; agentId: string; sentTo?: string }
  | { name: "confirm"; agentId: string; agentName: string; display: Display }
  | { name: "done"; agentId: string }

/**
 * Steps (a) through (e) of locked-agent registration. Each step's server
 * route is the authority; this only shows what it returns.
 */
export function NopRegisterFlow() {
  const { t, rich } = useNop()
  const [step, setStep] = useState<Step>({ name: "loading" })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [agentId, setAgentId] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/enterprise/nop/register")
      .then((r) => r.json())
      .then((d) => {
        if (d.registeredAgentId) setStep({ name: "done", agentId: d.registeredAgentId })
        else if (d.step === "email") setStep({ name: "email", agentId: d.agentId })
        else if (d.step === "code") setStep({ name: "code", agentId: d.agentId })
        else if (d.step === "verified") setStep({ name: "confirm", agentId: d.agentId, agentName: d.agentName, display: d.defaults })
        else setStep({ name: "id" })
      })
      .catch(() => setStep({ name: "id" }))
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError(t("common.network"))
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setStep({ name: "id" })
    setCode("")
    setEmail("")
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {step.name === "loading" && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {step.name === "id" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const { ok, data } = await post("/api/enterprise/nop/register/start", { agentId })
              if (!ok) return setError(data.message ?? t("common.generic"))
              setStep({ name: "email", agentId: agentId.trim() })
            })
          }}
          className="flex flex-col gap-4"
        >
          <Field id="agentId" label={t("reg.id_label")}>
            <input id="agentId" inputMode="numeric" autoComplete="off" className={field} value={agentId}
              onChange={(e) => setAgentId(e.target.value)} placeholder={t("reg.id_placeholder")} />
          </Field>
          <button type="submit" disabled={busy || !agentId.trim()} className={primary}>
            {busy ? t("reg.checking") : t("reg.continue")}
          </button>
        </form>
      )}

      {step.name === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const { ok, data } = await post("/api/enterprise/nop/register/email", { email })
              if (!ok) {
                setError(data.message ?? t("common.generic"))
                if (data.error === "email_mismatch" || data.error === "no_registration") setStep({ name: "id" })
                return
              }
              setStep({ name: "code", agentId: step.agentId, sentTo: data.sentTo })
            })
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted-foreground">
            {rich("reg.email_intro", { agentId: <span className="font-medium text-foreground">{step.agentId}</span> })}
          </p>
          <Field id="verifyEmail" label={t("reg.email_label")}>
            <input id="verifyEmail" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !email.trim()} className={primary}>
              {busy ? t("reg.sending") : t("reg.send_code")}
            </button>
            <button type="button" onClick={restart} className={secondary}>
              {t("reg.change_id")}
            </button>
          </div>
        </form>
      )}

      {step.name === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const { ok, data } = await post("/api/enterprise/nop/register/verify", { code })
              if (!ok) {
                setError(data.message ?? t("common.generic"))
                if (data.error === "too_many_attempts" || data.error === "no_registration") restart()
                return
              }
              setStep({ name: "confirm", agentId: data.agentId, agentName: data.agentName, display: data.defaults })
            })
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted-foreground">
            {step.sentTo ? t("reg.code_sent_to", { sentTo: step.sentTo }) : t("reg.code_sent")}
          </p>
          <Field id="code" label={t("reg.code_label")}>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" className={field} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !code.trim()} className={primary}>
              {busy ? t("reg.checking") : t("reg.verify")}
            </button>
            <button type="button" onClick={restart} className={secondary}>
              {t("reg.start_over")}
            </button>
          </div>
        </form>
      )}

      {step.name === "confirm" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              setFieldErrors({})
              const { ok, data } = await post("/api/enterprise/nop/register/confirm", step.display)
              if (!ok) {
                if (data.fields) return setFieldErrors(data.fields)
                setError(data.message ?? t("common.generic"))
                if (data.error !== "invalid_fields") restart()
                return
              }
              setStep({ name: "done", agentId: data.agentId })
            })
          }}
          className="flex flex-col gap-5"
        >
          <p data-testid="nop-confirm" className="rounded-lg border border-border bg-[var(--surface-soft)] p-4 text-sm">
            {rich("reg.confirm_line", {
              name: <span className="font-semibold">{step.agentName}</span>,
              agentId: <span className="font-semibold">{step.agentId}</span>,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("reg.confirm_help")}
          </p>
          <DisplayInputs value={step.display} onChange={(display) => setStep({ ...step, display })} errors={fieldErrors} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primary}>
              {busy ? t("reg.registering") : t("reg.confirm_submit")}
            </button>
            <button type="button" onClick={restart} className={secondary}>
              {t("reg.not_me")}
            </button>
          </div>
        </form>
      )}

      {step.name === "done" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {rich("reg.done", { agentId: <span className="font-semibold">{step.agentId}</span> })}
          </p>
          <Link href="/enterprise/nop/profile" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
            {t("reg.view_profile")}
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

type ProfileResponse = {
  profile: Display & { agentId: string; companyName: string; referralCode: string; qrDestination: string }
  status: string | null
  canGenerate: boolean
}

/** The agent's profile page: system fields read-only, display fields editable. */
export function NopProfileForm() {
  const { t } = useNop()
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [missing, setMissing] = useState(false)
  const [display, setDisplay] = useState<Display | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/enterprise/nop/agent-profile").then(async (r) => {
      if (r.status === 404) return setMissing(true)
      const d: ProfileResponse = await r.json()
      setData(d)
      setDisplay({ displayName: d.profile.displayName, displayPhone: d.profile.displayPhone, displayEmail: d.profile.displayEmail })
    })
  }, [])

  if (missing) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm">
        {t("profile.not_registered")}{" "}
        <Link href="/enterprise/nop/register" className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
          {t("profile.register_link")}
        </Link>
      </div>
    )
  }
  if (!data || !display) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 border-t border-border py-2 first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{value}</dd>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <dl data-testid="nop-system-fields" className="rounded-2xl border border-border bg-card p-6 text-sm">
        {row(t("profile.agent_id"), data.profile.agentId)}
        {row(t("profile.company"), data.profile.companyName)}
        {row(t("profile.referral"), data.profile.referralCode)}
        {row(t("profile.enrollment_link"), data.profile.qrDestination)}
        {row(t("profile.status"), statusLabel(t, data.status))}
      </dl>
      <form
        className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErrors({})
          setMessage(null)
          const { ok, data: out } = await post("/api/enterprise/nop/agent-profile", display, "PATCH").catch(() => ({ ok: false, data: {} as Record<string, unknown> }))
          setBusy(false)
          if (!ok) {
            if (out.fields) setErrors(out.fields as Record<string, string>)
            else setMessage(t("profile.save_failed"))
            return
          }
          const p = (out as { profile: Display }).profile
          setDisplay({ displayName: p.displayName, displayPhone: p.displayPhone, displayEmail: p.displayEmail })
          setMessage(t("profile.saved"))
        }}
      >
        <DisplayInputs value={display} onChange={setDisplay} errors={errors} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={primary}>
            {busy ? t("profile.saving") : t("profile.save")}
          </button>
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </form>
    </div>
  )
}

const STATUS_KEYS = {
  active: "status.active",
  pending: "status.pending",
  suspended: "status.suspended",
  terminated: "status.terminated",
} as const

function statusLabel(t: ReturnType<typeof useNop>["t"], status: string | null): string {
  if (status && status in STATUS_KEYS) return t(STATUS_KEYS[status as keyof typeof STATUS_KEYS])
  return t("status.not_on_roster")
}

/** The way out of the NOP pages while /dashboard sends agents back here. */
export function NopSignOut() {
  const { t } = useNop()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
        router.push("/login?next=/enterprise/nop/profile")
        router.refresh()
      }}
      className="min-h-11 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      {t("page.sign_out")}
    </button>
  )
}
