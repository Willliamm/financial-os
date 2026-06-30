# 0001 — Static export, no backend

## Status

Accepted

## Context

Financial OS is a personal-finance planning app. It holds very private data:
net worth, income, loans, investments, and retirement plans.

We want three things:

1. **Privacy.** The user's financial data should not sit on our servers.
2. **Offline-first.** The app should work with no network at all.
3. **Cheap, simple hosting.** No servers to run, patch, or pay for.

A traditional web app needs a backend: a server, a database, and an API.
That backend would store user data, cost money, and need security work.
It would also break the offline goal.

Next.js 15 App Router can run with `output: "export"`. This produces a fully
**static** site: plain HTML, CSS, and JavaScript files in `out/`. Any static
host can serve it. There is no Node server at runtime.

## Decision

Build Financial OS as a **static, offline-first single-page app (SPA)** using
Next.js 15 App Router with `output: "export"`.

This means we give up, on purpose, every server-side Next.js feature:

- **No** server-side rendering (SSR).
- **No** backend or database server.
- **No** API routes.
- **No** middleware.
- **No** server actions.

All logic runs in the browser. All data lives on the device (see ADR 0002).
Optional backup goes to the user's own Google Sheets (see ADR 0003).

Because there is no server runtime, components are **client** components by
default, and the app behaves like an SPA after first load.

## Consequences

**Good**

- Strong privacy: financial data never touches our servers.
- True offline use: the app runs with no network.
- Hosting is a static file drop — cheap and simple.
- No server to secure, scale, or maintain.

**Bad / trade-offs**

- No SSR means no server data fetching and no per-request logic.
- Dynamic `[id]` routes cannot be prerendered. Detail pages use query params
  instead: `/property?id=...`, `/scenario?id=...`.
- We need client-side stores and a client database (Zustand, TanStack Query,
  Dexie/IndexedDB).
- Internationalization must work without middleware (see ADR 0006).
- **Build gotcha:** never run `npm run build` while `npm run dev` is running.
  Both use the `.next` folder, and the build fails with
  `Cannot find module for page: /_not-found/page`.
