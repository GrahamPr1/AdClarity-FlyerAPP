# NOP_FROZEN — Neighborhood Outreach Program freeze list

Everything below belongs to the Neighborhood Outreach Program (NOP) — the
enterprise agent portal, its flyer kits, and its admin tooling. **On the
`agent-platform` branch and in every later brief, none of it is modified.**
New multi-client agent-platform code lives beside it, never inside it.

Generated 2026-11-13 from `main` @ `fad3e3f` by grepping file names, imports of
`lib/enterprise`, and every Redis key / Blob path literal under the NOP code.
If a later brief needs to change something listed here, stop and ask Graham.

> **Naming collision warning.** NOP already owns the word "agent" in this
> codebase: the `/agent` routes, `/api/enterprise/agent/*`, and the Redis
> prefixes `agent-account:`, `agent-flags:`, `agent-id:`, `agent-billing:`,
> `agent-stripe-event:` and `client:*:agent-*`. The new platform must use a
> distinct namespace (suggestion: `ap:` for Redis, `/platform` or `/ap` for
> routes, `ap/` for Blob paths in `oneflyer-nonprod`) so nothing can collide with or read NOP data.

---

## 1. Directories (everything beneath them is frozen)

| Path | What it is |
|---|---|
| `enterprise/nop/` | Flyer kits v1.1.1 and v2 (HTML, PDFs, fonts, icons, previews) |
| `lib/enterprise/` | All enterprise/NOP server logic, incl. `portal/`, `nop-render/`, `nop-i18n/` |
| `app/enterprise/` | `/enterprise/nop/*` agent pages (dashboard, flyer, profile, register) |
| `app/agent/` | `/agent/*` agent portal (create, events, leads, page, pro, profile, sign-in, signature, start, team) |
| `app/program/` | `/program/*` program-admin portal |
| `app/a/[code]/` | Agent short link + contact |
| `app/p/[code]/` | Public agent page (contact, photo, qr) |
| `app/e/[code]/` | Public event page + check-in |
| `app/admin/enterprise/` | `/admin/enterprise/agents`, `/admin/enterprise/nop` |
| `app/api/enterprise/` | `/api/enterprise/nop/*` and `/api/enterprise/agent/*` |
| `app/api/admin/enterprise/` | agent-views, agents, features, nop/*, view-as |
| `app/api/program-admin/` | signin, signout, verify |
| `docs/images/nop-kit-v2-spanish-footer/` | Kit review images |

## 2. Individual files outside those directories

**Routes**
- `app/agente/route.ts` (Spanish `/agente` entry)
- `app/api/cron/nop-event-reminders/route.ts`
- `app/api/cron/nop-followup-reminders/route.ts`
- `app/api/cron/nop-lead-retention/route.ts`
- `app/api/cron/nop-monthly-email/route.ts`

**Components**
- `components/admin-nop-agent-data.tsx`, `admin-nop-enroll-domain.tsx`,
  `admin-nop-events.tsx`, `admin-nop-followup-reminders.tsx`,
  `admin-nop-monthly-email.tsx`, `admin-nop-print-requests.tsx`,
  `admin-nop-signups.tsx`, `admin-nop-sms-optouts.tsx`
- `components/admin-program-admins.tsx`, `components/program-admin.tsx`
- every `components/nop-*.tsx`: access, agent, agent-billing,
  agent-detail-admin, agent-leads, agent-page-settings, agent-page-view,
  agents-admin, convert-admin, dashboard, email-signature, event-editor, i18n,
  lead-form, monthly-email-toggle, portal, print-button, print-request,
  recruit-share, team-send

**Scripts / docs / tests**
- `scripts/stripe-agent-setup.ts`, `scripts/seed-enterprise-demo.ts`
- `docs/nop-kit-v2-spanish-footer-options.md`, `docs/agent-portal-status.md`,
  `docs/enterprise-pilot-readiness.md`
- `tests/nop-*.test.ts` (all), `tests/agent-portal-*.test.ts` (all),
  `tests/agent-token-budgets.test.ts`, `tests/stripe-billing-agent-isolation.test.ts`,
  `tests/regression/agent-flyer-snapshot.regression.ts`

**Config entries (not whole files)**
- `vercel.json` — the four `/api/cron/nop-*` cron entries.

## 3. Shared files with NOP sections — edit only outside the NOP parts

These files are core OneFlyer but contain NOP branches. Changes elsewhere in
them are allowed; the NOP lines are frozen and must keep behaving identically.

- `middleware.ts` — agent redirect to `/agent` (`holdsAgentId`) and its matcher entries
- `lib/types.ts` — NOP/agent types
- `lib/billing.ts` — agent-billing isolation
- `lib/email.ts` — NOP agent emails
- `lib/monthly-results.ts`, `lib/offer-refresh.ts` — agent-aware paths
- `app/login/page.tsx`, `app/reset-password/page.tsx`, `app/privacy/page.tsx`,
  `components/mobile-nav.tsx`, `components/admin-pro-trial.tsx`
- Generation routes that call `lib/enterprise/generation-guard.ts`:
  `app/api/campaigns/generate`, `app/api/campaigns/new-promotion`,
  `app/api/deliverables/retry`, `app/api/goal-campaign/execute`,
  `app/api/intake`, `app/api/quick-prompt` (+ `/refine`, `/regenerate`),
  `app/api/auth/forgot-password`, `app/dashboard/page.tsx`,
  `app/dashboard/offer/[flyerId]/page.tsx`

## 4. Routes (URL space)

Pages: `/agent/**`, `/agente`, `/program/**`, `/enterprise/nop/**`,
`/a/[code]/**`, `/p/[code]/**`, `/e/[code]/**`, `/admin/enterprise/**`

APIs: `/api/enterprise/nop/**`, `/api/enterprise/agent/**`,
`/api/admin/enterprise/**`, `/api/program-admin/**`, `/api/cron/nop-*`

## 5. Redis keys and prefixes

`*` = a variable segment. Keys are exact unless shown with `*`.

**`nop-` prefixed (all of `nop-*` is reserved)**
- `nop-access:*`, `nop-access:*:ip:*`, `nop-access:*:sub:*`
- `nop-agent:*` and its sub-keys `:events`, `:leads`, `:page`,
  `:pro-trial-used`, `:qr-code`, `:recruit-code`, `:recruits`, `:retention`,
  `:scans`, `:team-picks`
- `nop-agent-page:*`, `nop-agent-data-moves`, `nop-agent-account-deletions`,
  `nop-account-conversions`, `nop-admin-actions`
- `nop-checkin:*`, `nop-code-day:agent:*:*`, `nop-code-day:email:*:*`
- `nop-event:*`, `nop-event-code:*`, `nop-event-checkin:*`,
  `nop-events-all`, `nop-events-by-start`, `nop-event-reminder-runs`
- `nop-followup-email:*:*`, `nop-followup-email-runs`
- `nop-flyers:settings`, `nop-flyers:settings-log`,
  `nop-flyers:enroll-domain-log`, `nop-flyers:enroll-settings-log`,
  `nop-flyers:check-agent-log`
- `nop-lead:*`, `nop-lead-deletions`
- `nop-monthly-email:*:*`, `nop-monthly-email-runs`
- `nop-program-status-log`, `nop-pro-trial`, `nop-pro-trial-log`
- `nop-qr-code:*`, `nop-recruit-code:*`
- `nop-render-log`, `nop-render-log:*`, `nop-thumb:*`
- `nop-retention-due`, `nop-retention-runs`
- `nop-rsvp:*`, `nop-signups:log`
- `nop-sms-optout`, `nop-sms-optout-log`

**Agent / program / roster keys (NOP-owned, no `nop-` prefix)**
- `agent-account:*`, `agent-flags:*` (incl. `agent-flags:nop`), `agent-id:*`
- `agent-billing:customer:*`, `agent-stripe-event:*`
- `program-admins:nop`, `program-admin:signin:ip:*`,
  `program-admin:signin:sub:*`, `program-admin:verify:ip:*`
- `roster:*:email:*`, `roster:*:ids`
- `enterprise-org:*:features`
- `admin-agent-views`
- `print-requests:*` (NOP agent print requests)
- `sms:*` (NOP SMS opt-out bookkeeping)

**NOP fields on shared client records**
- `client:*:agent-billing`, `client:*:agent-pro-trial-used`,
  `client:*:agent-profile`, `client:*:agent-tier`,
  `client:*:agent-tier-source`, `client:*:converted-to-agent`

(NOP code also reads core keys such as `client:*:plan`,
`client:*:last-active`, `deliverables:*`, `content-asset:*`, `admin:*`. Those
are core OneFlyer keys. They aren't frozen, but changing their shape breaks NOP,
so any change to them must keep NOP's tests green.)

## 6. Blob paths

- `nop-agent-photos/*` — agent page photos (private)

## 7. Environment variables

- `NOP_RETENTION_LIVE` — production-only switch for lead retention deletes
- `STRIPE_PRICE_AGENT_PRO_MONTHLY`, `STRIPE_AGENT_PORTAL_CONFIGURATION_ID` —
  NOP agent Pro billing (not set on `agent-platform`; agent billing fails closed there)
- `CRON_SECRET` — shared with the other crons, but guards the four NOP crons

## How to check a change against this list

```bash
git diff --name-only main...HEAD | grep -E \
  '^(enterprise/nop/|lib/enterprise/|app/(enterprise|agent|program|a|p|e)/|app/agente/|app/admin/enterprise/|app/api/(enterprise|admin/enterprise|program-admin)/|app/api/cron/nop-|components/(nop-|admin-nop-|admin-program-admins|program-admin)|tests/(nop-|agent-portal-))'
```

Any output means a frozen file was touched.
