# Local development

## Why this exists

Development and production used to share one hosted Upstash instance and one
session-signing secret. Running `npm run dev` wrote to live customer data, and
a copy of `.env.local` was enough to forge a production session for any
account — including the admin.

Both are now separated, and the separation is **enforced**, not remembered:
each Redis instance stores a marker naming the environment it belongs to, and
a development process refuses to start against one marked `production`.

```
LOCAL DEV  ──> redis-server on 127.0.0.1   (marker: development)
PREVIEW    ──> hosted Upstash, its own DB  (marker: preview)
PRODUCTION ──> hosted Upstash              (marker: production)
```

Each of the three has its own database **and** its own `SESSION_SECRET`, so a
session forged in one is worthless in the others.

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
```

It must **never** contain an `upstash.io` URL. If it does, you are pointed at
production and the app will refuse to boot.

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
  ISOLATION                : OK — connected to this environment's own database
```

It prints **fingerprints, never values**. The fingerprints exist so you can
compare environments: if dev and prod ever show the same
`sessionSecretFingerprint`, they're signing sessions with the same key and a
dev leak forges production sessions.

On a brand-new database, label it once:

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

This creates nine `@dev.invalid` accounts — one per (role × browser engine).
They're split per engine on purpose: sign-in is rate-limited per account, and
Playwright runs the three engines in parallel, so a shared login trips that
limiter and fails tests for the wrong reason.

`seed:dev` refuses to run unless both this process **and** the connected
database are marked `development`, so it cannot create accounts in production.

## Moving to a hosted dev database later

If you'd rather have a hosted Upstash instance for development (useful for
sharing state across machines), provision a **second** database — never reuse
the production one — put its REST URL and token in `.env.local`, and run
`npm run env:check -- --claim` to mark it. Nothing in the code needs to
change; the guardrail identifies databases by their marker, not by hostname.
