# Financial OS — Technical Roadmap

This is a forward-looking plan. It describes what could come next and why. It is meant to
help us make decisions, not to lock in dates.

Effort sizes use a simple scale:

- **S** = small, about a week or less.
- **M** = medium, about two to three weeks.
- **L** = large, about a month or more.

---

## Guiding principles

Every change below must respect three rules. These rules protect what makes the app
work today.

1. **Keep it offline-first.** The app is a static export (`output:"export"`). There is no
   server in the build — no SSR, no API routes, no middleware, no server actions. The
   browser is the runtime. IndexedDB (via Dexie) stays the operational database. The
   built `out/` folder must stay a pure static bundle.
2. **Keep the domain layer pure.** The calculation engines (net worth, FIRE, tax,
   projections, and the rest) have no React, Dexie, or Google imports. They must stay that
   way. New features feed data *into* the engines; they do not change the engines.
3. **Add a backend only where a secret or a third party forces it.** If a feature needs a
   secret key or a vendor API that cannot run safely in the browser, we add a small
   **external** service. That service lives outside the Next.js build and is called over
   HTTPS. It is always additive and always behind a feature flag. Demo mode keeps using
   its in-memory mock clients no matter what.

### The seams that make change cheap

Three parts of the current code make all of this low-risk:

- **Command pipeline** (`infrastructure/db/command-service.ts`, `applyCommand`). One Dexie
  transaction writes the entity, an audit command, and a sync-queue item together. The
  local write always happens before any remote sync. Any new data source can ride this
  pipeline.
- **Sync Engine seam** (`infrastructure/sync/sync-engine.ts`). `pushPending`,
  `importWorkbook`, and `syncAll` take a `GoogleClients`-shaped object and an opaque
  `spreadsheetId`. Anything that matches that shape is a drop-in remote. This is the swap
  point for Firestore later.
- **Pure domain layer** (`domain/`). Untouched by sync, storage, or auth changes.

---

## Section 1 — Plaid integration (minimal backend for token exchange)

### Problem

Plaid lets users link their real bank accounts and pull transactions. But Plaid needs the
`client_id` and `secret` on the **server** for two calls: `/link/token/create` and
`/item/public_token/exchange`. The resulting `access_token` must **never** reach the
browser. Transactions then come from `/transactions/sync`, which is also secret-gated.

This is the one feature that directly conflicts with "no backend." The Plaid secret cannot
live in a static SPA. So Plaid forces a small external service — exactly the kind the
guiding principles allow.

> **Security note (non-negotiable):** The Plaid `client_id` + `secret` and any
> `access_token` must never be shipped to or stored in the browser in plain form. They live
> only in the external service's environment.

### Options

**Where the small backend runs:**

1. **A single Cloudflare Worker (credential-proxy pattern).** One Worker with a few routes:
   `/link/token`, `/exchange`, `/transactions/sync`, `/webhook`. The secret is set with
   `wrangler secret put` and read from `env` at runtime. It never ships to the client.
   Lowest footprint, generous free tier, edge latency.
2. **Firebase Cloud Functions.** Same logic as HTTPS callable functions. Heavier cold
   starts, needs a Firebase project. Natural if Section 2 or 3 is already on the table.
3. **Supabase Edge Functions / AWS Lambda + API Gateway.** Same capability, more setup.

**The hard sub-problem — where does the `access_token` live?**

- **(A) Stateless Worker.** After exchange, the Worker encrypts the `access_token`
  (AES-GCM with a Worker-only key) and returns the ciphertext to the SPA, which stores it
  in IndexedDB. On each fetch the SPA sends the ciphertext back; the Worker decrypts and
  calls Plaid. *Pro:* keeps "no backend state," fits the offline-first feel. *Con:*
  ciphertext lives client-side; key rotation is awkward; weaker than true vaulting.
- **(B) Worker + Cloudflare KV/D1 + per-user auth.** The Worker stores the real
  `access_token` keyed by an authenticated user id. The SPA only ever holds an opaque
  `item_id`. This is the standard secure pattern. But it needs real user auth — which pulls
  toward Section 2.

### Recommended flow

Use Plaid Hosted Link to avoid OAuth redirect plumbing in a static SPA.

1. SPA → Worker `POST /link/token`. Worker calls `/link/token/create` with the secret,
   returns a `link_token`.
2. SPA opens Plaid Link (or the Hosted Link URL) with that token. User signs in at their
   bank.
3. Link returns a short-lived `public_token` to the SPA.
4. SPA → Worker `POST /exchange {public_token}`. Worker calls
   `/item/public_token/exchange`, then stores or returns the `access_token` per option A
   or B.
5. SPA → Worker `POST /transactions/sync`. Worker pages Plaid and returns normalized
   transactions.
6. SPA maps each transaction into the existing **command pipeline** — every transaction
   becomes a `create` command via `applyCommand`. Plaid data then flows through the same
   audit log and sync-queue as manual entry. **No engine changes.**

### Security checklist

- Secret only in `wrangler secret` (or Functions config), never in code or client.
- CORS locked to the app origin.
- Worker verifies a per-request auth token using `crypto.subtle.timingSafeEqual` (no
  length short-circuit).
- Rate-limit the routes.
- Verify Plaid webhook signatures.
- Never log tokens.

### Tradeoffs

A Worker is the lowest footprint and cheapest, but it is the project's first always-on
dependency and a real secret to rotate. Stateless option (A) keeps the offline feel but is
cryptographically weaker. Stateful option (B) is safer but demands auth.

### Recommendation

Build a **single Cloudflare Worker** using the credential-proxy pattern. Start with
**stateless option (A)** behind a lightweight signed-token gate. Treat option (B) and real
auth as the **trigger to do Section 2**. Begin in Plaid **Sandbox / Limited Production**
(free, ≤200 live calls) to validate before any subscription billing. Keep Plaid behind a
feature flag; demo mode keeps its mock clients.

### Effort

- Worker + Sandbox link flow: **S** (about a week).
- Production hardening (encryption, webhooks, transaction→command mapping, dedupe):
  **+M** (one to two more weeks).

---

## Section 2 — A small Firebase layer alongside today's architecture

Add the *minimum* Firebase to make Plaid secure and to give us a real user identity —
without rewriting the app.

### Problem

Plaid option (B), and any future multi-device story, need real identity and a
server-trusted store. Today the login at `/` is a mock. We need a real `userId` /
`userEmail`, and a safe place to vault the Plaid `access_token`.

### What moves vs what stays

**Stays in IndexedDB (Dexie) — unchanged:**

- All operational data: entities, the audit command log, the sync-queue, locks, conflicts,
  projection snapshots.
- The command pipeline. It does not change. Offline-first is preserved.

**Moves to Firebase:**

- **Auth** — replaces the mock login. Provides the real `userId` / `userEmail` for the
  `Actor` already threaded through `applyCommand`.
- **Cloud Functions** — host the Plaid secret and token exchange (the Section 1 logic), now
  gated by a verified Firebase ID token instead of a hand-rolled signed token. Also the
  natural home for writing the encrypted `access_token` to Firestore.
- **Firestore (narrow use)** — only what needs server trust: the Plaid `item` /
  `access_token`, locked down by security rules. Optionally a per-user backup mirror later.

### Coexistence with the Sync Engine seam

This is the elegant part. Firestore does **not** replace Google Sheets here. It sits
*beside* it. Plaid Functions feed transactions into the command pipeline, and the existing
`syncAll(clients, spreadsheetId)` keeps pushing to Sheets unchanged. Firebase is purely
additive: Auth swaps the identity source, Functions are a dependency Section 1 already
introduced, and Firestore is scoped to secrets only.

### Options

1. **Firebase Auth + Functions only** (Firestore just for token storage). Smallest. Sheets
   stays the user-facing remote.
2. **Add Firestore as an optional second remote** (a new `GoogleClients`-shaped adapter) so
   power users can sync to Firestore *or* Sheets.
3. **Auth only, keep Plaid on the Cloudflare Worker.** Mix providers; the Worker verifies
   Firebase ID tokens.

### Tradeoffs

Firebase puts auth + functions + store in one console (good developer experience), but it
is a bigger vendor commitment and pulls more config into a previously zero-backend app.
Functions cold starts are worse than Workers for the Plaid proxy. Option 3 avoids vendor
lock-in for the proxy but means running two providers.

### Recommendation

Adopt **Firebase Auth + Cloud Functions for Plaid, with Firestore scoped to server-only
secrets (Option 1).** Keep Google Sheets as the user's remote for now. This is the smallest
step that makes Plaid *secure* (option B) rather than *clever* (option A), and it reuses the
`Actor` plumbing we already have.

### Effort

**M** (about two to three weeks). Less if Section 1 already shipped on Functions instead of
a Worker.

---

## Section 3 — Full migration to Firebase (Firestore replaces Google Sheets as the remote)

This is optional. Do it only if multi-device or scale demands it.

### Problem

Google Sheets as a sync target is charming for transparency and export, but it is a poor
operational remote. It uses row-based mapping (`sheet-mapper.ts`), full-sheet reads
(`getValues(... 'A:ZZ')`), append/rewrite semantics, a manual `__sync_log`, and our own
lock-manager and conflict-resolver. Firestore offers real queries, listeners, server
timestamps, security rules, and a built-in IndexedDB offline cache with multi-tab support.

### Why it is swappable

The Sync Engine already depends only on the `GoogleClients` *shape* and an opaque
`spreadsheetId`. A `FirestoreClients` adapter that exposes the same surface (read
collection, upsert doc, soft-delete) lets `pushPending` and `importWorkbook` work against
Firestore with no domain or UI changes. The command pipeline, dirty-flagging, and conflict
records all still apply.

### Two ways to do the swap

- **(i) Keep our custom sync, point it at Firestore.** Reuse `applyCommand` and the
  sync-queue; the adapter just writes documents instead of rows. We keep full control of
  conflict policy and offline behavior. Minimal conceptual change.
- **(ii) Adopt Firestore's own offline persistence and listeners.** This dissolves much of
  the custom sync, lock, and conflict code. Less code to own, real-time multi-device. But
  it partly abandons the bespoke command/audit model that is core to this app's identity,
  and it would run two IndexedDB stores (Dexie + Firestore's) unless we move entities out
  of Dexie entirely.

### Tradeoffs vs Sheets

- **Gains:** real queries and indexes; listeners (live multi-device); server timestamps
  that kill a class of conflicts; security rules; scales past Sheets' row limits; no
  `A:ZZ` full reads.
- **Losses:** the user-readable spreadsheet disappears — that is a genuine product feature
  here, because users can open and edit their data in Sheets. Plus vendor lock-in, cost at
  scale, and offline export now needs a separate code path.
- **Migration risk:** a one-time backfill from existing Sheets/IndexedDB into Firestore. A
  dual-write window is recommended.

### Recommendation

Migrate via **path (i): a `FirestoreClients` adapter behind the existing seam, keeping the
command pipeline intact.** Offer Firestore as the *default* remote, and **keep Sheets as an
optional one-way export/backup** to preserve the transparency feature while dropping it as
the live sync engine. Do **not** adopt path (ii) wholesale — the bespoke
command/audit/conflict model is a product differentiator, and dual IndexedDB stores add
complexity. Reassess real-time listeners later if multi-device becomes a priority.

### Effort

**L** (about three to four weeks): the adapter, a doc-mapper analog to `sheet-mapper`,
migration/backfill, security rules, and conflict-policy revalidation. Keeping Sheets export
alive: **+S** (three to four days).

---

## Section 4 — Recurrence model for income and expenses (one-off vs recurring)

### Problem

Today `IncomeSource` carries `annualAmountCents` and `Expense` carries
`monthlyAmountCents`. Each entity bakes in a single fixed cadence. There is no way to model:

- a one-time `$1,500` bonus in March,
- rent that rises every 12 months,
- quarterly taxes,
- an expense that ends on a date.

`startDate` and `endDate` exist, but the cadence is implicit. And Plaid transactions
(Section 1) are dated events that need a recurrence-aware home.

### Proposal — a reusable `Schedule` value object, not a new entity

Keep it in the existing entity / Zod / command pattern. No engine rewrite, because
annualized amounts can be **derived** from the schedule.

```ts
// domain/value-objects/schedule.ts  (pure — no React/Dexie)
type Frequency = "once" | "daily" | "weekly" | "biweekly" | "semimonthly"
               | "monthly" | "quarterly" | "semiannual" | "annual";

interface Schedule {
  frequency: Frequency;
  interval: number;            // every N units (e.g. every 2 months)
  anchorDate: string;          // ISO; first occurrence
  endDate: string | null;      // null = open-ended
  count: number | null;        // alternative bound: N occurrences
  dayOfMonth?: number | null;  // for monthly/semimonthly anchoring
  amountCents: number;         // amount PER occurrence (integer cents)
  growthRateBps: number;       // applied per period or per year (documented)
}
```

### Entity changes (additive, backward-compatible)

- Add `schedule: Schedule | null` to `IncomeSource` and `Expense`.
- Keep legacy `annualAmountCents` / `monthlyAmountCents` as a **fallback** when `schedule`
  is null.
- Add a pure helper `annualizedCents(entity)` that returns the schedule-derived figure or
  the legacy field. The engines call this helper, so net-worth, FIRE, and projection
  engines need **one** touch-point, not a rewrite.
- For true one-offs, use `frequency: "once"` with `anchorDate` = the date. This also models
  lumpy events (bonus, tax refund, big purchase) that projections cannot represent today.

### Zod and command fit

- Add a `scheduleSchema` with refinements: `interval >= 1`, exactly one of `endDate` or
  `count`, `amountCents >= 0`. It nests into the existing income/expense schemas.
- Mutations still go through `applyCommand` unchanged. `schedule` is just more entity data,
  so the audit log, sync-queue, and the Section 3 Firestore swap all carry it for free.
- Sheets mapping: serialize `schedule` as a JSON string in one column. `sheet-mapper`
  already maps column → field.

### One shared representation for dated events

Add a pure generator `expandOccurrences(schedule, fromDate, toDate)` that returns dated,
signed cent amounts. It feeds:

- projections (monthly cashflow curves instead of flat annual averages), and
- a future calendar / cashflow-timeline UI.

This is the bridge that lets Plaid transactions and manual recurring items share one
representation.

### UI

Add a `ScheduleField` composite in `components/forms/`: a frequency dropdown, an interval
stepper, an anchor date, and an "ends: never / on date / after N times" radio. It collapses
to a single date input when `frequency: "once"`. Render a plain-language summary like
"Every 2 weeks, $1,500, until Dec 2027." Reuse `MoneyInput` for `amountCents`.

### Options

- **(a) Embed `schedule` on the entity (above).** Least churn, engines mostly unchanged.
  But one entity cannot hold multiple unrelated cadences.
- **(b) A separate `recurring_rule` entity** referencing income/expense. More flexible
  (many rules per source, RRULE-like), but a new `EntityType`, new sheet/table, and new
  sync surface. Bigger lift.
- **(c) Adopt iCalendar RRULE strings.** Battle-tested, but overkill and harder to validate
  and localize.

### Recommendation

Go with **option (a): an embedded `Schedule` value object, plus the `annualizedCents`
helper and the `expandOccurrences` generator.** It is the only option that adds real
modeling power while touching the engines once and riding the existing command/Zod/sync
rails. Reserve option (b) for when users genuinely need multiple cadences per source.

### Effort

**M** (about one and a half to two weeks): value object + Zod + helper + engine
touch-point + `ScheduleField` UI + a migration that defaults legacy fields.

---

## Section 5 — Input and UX improvements for data entry

### Problem

`MoneyInput` is solid — it is focus-aware (editable while focused, `toLocaleString` display
on blur) and emits integer cents. But data entry is otherwise form-by-form. There are no
presets, no impact preview, no bulk paths, and percent entry is bare. Heavy planning apps
live or die on fast entry.

### Concrete improvements (each independent — ship one at a time)

1. **Smarter money and percent inputs.**
   - Money: accept shorthand (`1.5k` → $1,500, `2m` → $2,000,000, `1,234.56`), keep the
     caret stable while formatting, and show an optional inline "USD" note.
   - Percent: same focus/blur pattern as money, but stored as **bps** under the hood.
     Accept `5`, `5%`, `5.25`. Arrow keys step ±25 bps.
   - *Tradeoff:* shorthand parsing adds edge cases — cover them with vitest.
   - *Effort:* **S** (about 3 days).
2. **Field presets / quick-fill.** Per-field suggestion chips driven by the data-studio
   registry — e.g. expense category → typical inflation bps; loan type → typical rate;
   appreciation 3% / 5% / 7%.
   - *Tradeoff:* presets can mislead. Label them "typical, edit me."
   - *Effort:* **S** (about 3 days).
3. **Inline impact preview.** As the user edits a value in the drawer, show the delta on a
   headline metric (net worth, monthly cashflow, FIRE date), computed live by the **pure
   engines** off a draft entity — no save needed. This is the highest-value item: it turns
   data entry into "what-if" exploration and leverages the engines we already have.
   - *Tradeoff:* must debounce and run the engines on a draft copy off the Dexie store.
     Keep it client-only.
   - *Effort:* **S–M** (about a week).
4. **Keyboard flow.** Enter = save-and-next. Audit Tab order. ⌘/Ctrl+Enter submits, Esc
   cancels, `/` focuses search on list screens, arrow keys step numeric fields. Pairs
   naturally with the existing drawer forms.
   - *Effort:* **S** (about 3 days).
5. **Bulk import.** A CSV / paste-grid importer that maps columns → entity fields (reuse
   the registry's field metadata and `sheet-mapper` concepts), validates each row with the
   entity's Zod schema, shows a preview with per-row errors, then writes each row through
   `applyCommand`. So audit log, sync-queue, and any Section 3 remote all just work. This
   is a sibling to Plaid import — both are "many entities in, one command each."
   - *Tradeoff:* the mapping UI is the bulk of the work. Start with a fixed template before
     free-form mapping.
   - *Effort:* **M** (about one and a half weeks).

### Recommendation and sequencing

Ship in this order for compounding value:

1. Input parsing + percent (item 1)
2. Keyboard flow (item 4)
3. Inline impact preview (item 3)
4. Presets (item 2)
5. Bulk import (item 5)

Items 1 and 4 are cheap polish. Item 3 is the differentiator and is cheap because the
engines already exist. Item 5 is the heaviest, and is best done **after** the recurrence
model (Section 4) so imported rows can carry schedules, and **after** Plaid (Section 1) so
both share the "import → command" path.

### Effort

Full set: **L** spread across releases. The high-ROI core (items 1 + 3 + 4) is **M** (about
two weeks).

---

## Suggested overall sequencing

1. **Section 5 core** (inputs + keyboard + impact preview). Pure client, zero infra risk,
   immediate value. **M** (~2 weeks).
2. **Section 4 recurrence model.** Unlocks better projections and prepares the shared
   "dated event" representation. **M** (~2 weeks).
3. **Section 1 Plaid via Cloudflare Worker** (Sandbox → stateless). First external
   dependency, feature-flagged. **M** (~2–3 weeks).
4. **Section 2 Firebase Auth + Functions.** Promote Plaid to secure (token vaulting), real
   identity. **M** (~2–3 weeks).
5. **Section 5 bulk import.** Now that recurrence + the command-import path exist. **M**
   (~1.5 weeks).
6. **Section 3 Firestore remote** (optional, behind the Sync Engine seam, Sheets kept as
   export). Only if multi-device or scale demands it. **L** (~3–4 weeks).

Every step preserves the static export, the offline-first IndexedDB operational store, the
command pipeline, and the pure domain layer. External services are always additive and
feature-flagged. Demo mode keeps its mock clients throughout.

---

## Sources

- [Plaid security](https://plaid.com/core-exchange/docs/security/)
- [Plaid transactions](https://plaid.com/docs/api/products/transactions/)
- [Plaid pricing](https://plaid.com/pricing/)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Securing Worker secrets (Doppler)](https://www.doppler.com/blog/secure-cloudflare-workers-secrets)
- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore multi-tab sync](https://firebase.blog/posts/2018/09/multi-tab-offline-support-in-cloud/)
