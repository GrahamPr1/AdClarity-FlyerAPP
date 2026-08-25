# Local development

## Why this exists

Development and production used to share one hosted Upstash instance, one
session-signing secret, and one Vercel Blob store. Running `npm run dev` wrote
to live customer data and uploaded photos into the live store, and a copy of
`.env.local` was enough to forge a production session for any account —
including the admin.

All of it is now separated, and the separation is **enforced**, not
remembered: each stored resource carries a marker naming what it belongs to,
and a non-production process refuses to start against one marked
`production`.

**Redis** — one instance per environment:

```
LOCAL DEV  ──> redis-server on 127.0.0.1   (marker: development)
PREVIEW    ──> hosted Upstash, its own DB  (marker: preview)
PRODUCTION ──> hosted Upstash              (marker: production)
```

**Vercel Blob** — one store for production, one shared by everything else:

```
LOCAL DEV  ─┐
            ├─> oneflyer-nonprod  (marker: nonproduction)
PREVIEW    ─┘
PRODUCTION ───> oneflyer-forms    (marker: production)
```

Blob is split two ways rather than three because there is no per-store fee —
Vercel bills usage only, and recommends separate stores per environment — but
one non-production store is enough to keep laptops and pull requests away from
live customer photos. Its marker therefore names the CLASS (`nonproduction`),
which is the finest distinction it can honestly make. `BLOB_READ_WRITE_TOKEN`
used to be a single variable scoped to all three environments, so `npm run
dev` wrote customer photos straight into the live store.

Each Redis instance also has its own `SESSION_SECRET`, so a session forged in
one is worthless in the others.

Preview is included deliberately. It used to share the production database,
and the guard only warned there, so any pull request deployment served real
customer records and could write to them. Now anything that is not production
**refuses to boot** against a database marked `production` — see
`verdictForMarker` in `lib/env.ts` and the cases pinned in
`tests/env-guard.test.ts`.

## One-time setup

```bash
brew install redis          # real Redis, so dev matches production semantics
npm install
```

Your `.env.local` should contain:

```
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
UPSTASH_REDIS_REST_TOKEN=local-dev-token
APP_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
BLOB_READ_WRITE_TOKEN=<the oneflyer-nonprod store's token>
```

It must **never** contain an `upstash.io` URL. If it does, you are pointed at
production and the app will refuse to boot.

`NEXT_PUBLIC_SITE_URL` matters more than it looks. Uploaded-photo URLs and QR
redeem links are absolute and built from it (`lib/site-url.ts`). Left unset it
falls back to the production domain, so a photo you upload locally comes back
as an `oneflyer.org` URL pointing at a blob that only exists in the
non-production store — it uploads fine and then renders broken.

### Careful: `vercel env pull` will undo this

Several Vercel commands run `vercel env pull` as a side effect (`vercel blob
create-store` does). That overwrites `.env.local` with the values Vercel holds
for the **Development** environment — which still include production Upstash
credentials. After running any such command, check:

```bash
grep -E '^[A-Z_]+=.*upstash\.io' .env.local   # must print nothing
npm run env:check
```

The guardrail catches it either way: the dev server refuses to boot rather
than touch production. But you have to put the local values back.

## Running

Two processes. In separate terminals:

```bash
npm run dev:redis     # redis-server bridge on :8079  (leave running)
npm run dev           # the app
```

`dev:redis` is a small REST bridge (`scripts/dev-redis.mjs`). It's needed
because `@upstash/redis` speaks HTTP rather than the Redis wire protocol —
the bridge translates, so the data actually lives in a real `redis-server`
and you get genuine INCRBY atomicity, SCAN cursors and TTLs rather than an
imitation that could drift from production.

Start `redis-server` itself if it isn't already running:

```bash
redis-server --port 6379 --bind 127.0.0.1 --save '' --appendonly no --daemonize yes
```

## Checking which database you're on

```bash
npm run env:check
```

```
  app environment          : development
  redis marker             : development
  blob marker              : nonproduction
  REDIS ISOLATION          : OK — connected to this environment's own database
  BLOB ISOLATION           : OK — connected to this environment class's own store
```

It prints **fingerprints, never values**. The fingerprints exist so you can
compare environments: if dev and prod ever show the same
`sessionSecretFingerprint`, they're signing sessions with the same key and a
dev leak forges production sessions.

On a brand-new database or Blob store, label it once:

```bash
npm run env:check -- --claim
```

`--claim` refuses to relabel an already-marked database, so it can never
silently rename production to development.

## If the app refuses to start

```
Refusing to run development against the production database.
```

That is the guardrail doing its job. Your `UPSTASH_REDIS_REST_URL` points at
a database marked `production`. Point it back at `http://127.0.0.1:8079`.

```
Refusing to run development against the production Blob store.
```

Same guardrail, other resource (`lib/blob-env.ts`). Your
`BLOB_READ_WRITE_TOKEN` is production's. Pull the `oneflyer-nonprod` store's
token instead — `vercel blob list-stores` shows both.

Do not work around this by setting `APP_ENV=production` locally — that turns
the protection off and is how live customer data gets modified from a laptop.

## Wiping local data

Safe, because it is only ever your machine:

```bash
redis-cli -h 127.0.0.1 -p 6379 FLUSHALL
npm run env:check -- --claim     # re-apply the marker afterwards
```

## Tests

```bash
npm test            # unit — pure logic, no Redis or network
npm run test:browser # Playwright: chromium, firefox, webkit
npm run lint
npm run typecheck
```

The browser tests sign in, so they need seeded accounts:

```bash
npm run seed:dev
```

This creates `@dev.invalid` accounts — one per (role × browser engine), plus
an admin and one standing in for a real customer. They're split per engine on
purpose: sign-in is rate-limited per account, and Playwright runs the three
engines in parallel, so a shared login trips that limiter and fails tests for
the wrong reason. It also clears the sign-in throttle buckets, which repeated
local runs legitimately exhaust.

`seed:dev` refuses to run unless both this process **and** the connected
database are marked `development`, so it cannot create accounts in production.

## The Blob stores

```bash
vercel blob list-stores
```

`oneflyer-forms` is production's (customer photos, form-fill PDFs, business
profiles). `oneflyer-nonprod` is development and preview's. Never point a
local `.env.local` at the first one — the app will refuse to boot, which is
the point, but it is still the wrong token to be holding.

Creating more stores is free: Vercel bills storage, operations and transfer by
usage regardless of how many stores exist (Pro allows 500). If you ever want
preview on its own store separate from local dev, create a third and give it
its own marker — nothing in the code needs to change.

## Moving to a hosted dev database later

If you'd rather have a hosted Upstash instance for development (useful for
sharing state across machines), provision a **second** database — never reuse
the production one — put its REST URL and token in `.env.local`, and run
`npm run env:check -- --claim` to mark it. Nothing in the code needs to
change; the guardrail identifies databases by their marker, not by hostname.
