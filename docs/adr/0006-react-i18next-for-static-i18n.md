# 0006 — react-i18next for static i18n

## Status

Accepted

## Context

The app must support two languages: US English (`en-US`) and Brazilian
Portuguese (`pt-BR`). The original product spec is in Portuguese
(`docs/spec-ptbr-v3.md`).

The common Next.js choice is **next-intl**. But next-intl's routing and locale
detection lean on Next.js **middleware** and server features. Our app is a
**static export with no server and no middleware** (see ADR 0001). That makes
the middleware-based approach a poor fit.

We need an i18n (internationalization) library that runs fully in the browser,
needs no server, and works after a static export.

## Decision

Use **react-i18next** for internationalization.

- It runs entirely on the client. No middleware, no server needed.
- Translation resources exist for both `en-US` and `pt-BR`.
- All user-facing UI text comes from translation keys. Keys are namespaced with
  dot notation, for example `dashboard.netWorth.title` (see CONVENTIONS
  rule 12).

**Locale detection is manual**, in `lib/i18n/config.ts`. We do **not** use the
`i18next-browser-languagedetector` plugin.

Reason: with **i18next 26**, the language-detector plugin **breaks key
resolution** — keys stop resolving to translated strings. So we detect the
locale ourselves with simple code and skip the plugin entirely.

Two related rules from other decisions interact here:

- **Currency stays USD** in both locales. Only number formatting localizes; for
  example `pt-BR` shows `US$ 1.060.500,00`. There is no BRL conversion (see
  CONVENTIONS rule 8).
- **Domain-generated text is English-only.** Engine insights, alerts, and
  scenario-comparison metrics are produced in the pure domain layer. That layer
  must not import i18n or receive i18n keys (it must stay pure — see ADR 0002
  and CONVENTIONS rule 5). So this dynamic text stays English in both locales.
  This is intentional.

## Consequences

**Good**

- i18n works with a static export and no server.
- Two full locales for all static UI text.
- Manual detection avoids the i18next 26 + language-detector bug.

**Bad / trade-offs**

- We maintain locale detection by hand instead of using the standard plugin.
- Every new UI string needs a key in **both** locale files; a missing key is a
  bug.
- Domain-generated insight and alert text is not translated. Portuguese users
  see that dynamic text in English.
