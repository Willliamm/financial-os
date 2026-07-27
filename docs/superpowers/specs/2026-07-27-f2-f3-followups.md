# F2 + F3 (Portfolio & Quotes) — open follow-ups

**Date:** 2026-07-27
**Branch:** `feat/f2-f3-portfolio`
**Status:** feature complete; typecheck clean, 190 tests, lint clean, static export includes `/portfolio`. Not yet verified in a browser.

Every task passed its own review, and a whole-branch review followed. Everything that
review classified Critical or Important was fixed before merge. What remains is recorded
here so it is tracked rather than rediscovered.

---

## Fixed by the final review's fix wave

The whole-branch review found two Critical defects that no per-task review could have
seen, because both live in the *seams between* pieces built by different agents:

1. **Tickers were uppercased on write but not on read.** A holding entered as `voo` or
   `" VOO"` could never match a quote stored as `VOO`. It showed "No price" forever while
   the refresh toast reported success. Fixed with a shared `normalizeTicker` helper applied
   on both sides, plus Zod normalization for rows imported from the sheet.
2. **`totalAssetsCents` grew a `prices` parameter that no caller passed.** The dashboard
   KPI therefore showed cost basis while the net-worth chart beside it, `/investments` and
   `/portfolio` all showed market value — so entering your first lot made net worth appear
   to drop. Fixed by threading `useLatestPrices().prices` through the dashboard.

Also fixed in the same wave: a corrected manual price was ignored for the rest of the day
(same-day ties picked the oldest quote); "Set price" was only reachable for positions that
had no price, so a wrong price could not be corrected at all; the money-weighted return
counted lots whose holding had been deleted; a freshly written GOOGLEFINANCE formula reads
`Loading...` and was converted straight into a failure; and a non-USD quote was stored as
USD cents.

---

## Should fix soon

### S1 — Three engines, three copies of the same lot filter

`portfolio-engine.ts`, `lot-engine.ts` and `return-engine.ts` each define their own
`notDeleted` / `isOpen` helpers. That duplication is what produced the deleted-holding bug
in the return engine: the third copy was written without the live-holding join the other two
had. Consolidate into a shared `domain/engines/portfolio/filters.ts` before a fourth engine
lands.

### S2 — A partially priced portfolio understates the money-weighted return

`moneyWeightedReturnBps` counts an unpriced lot's cost as an outflow while it contributes
zero market value, so the return reads worse than reality. Excluding unpriced lots' flows
entirely would be more honest than counting them against nothing.

### S3 — `deriveDefaults` / `formValuesToPayload` have no `"shares"` branch

Safe today only because `sharesMicro` is `required`, so `requiredFieldErrors` blocks the
empty string before the payload is built. Add the branch before anyone introduces an
*optional* shares field.

### S4 — `price_quote` grows without bound, and sync is quadratic in row count

This is the first entity that accumulates automatically — tickers × trading days. Worse,
`pushPending` re-reads the whole sheet after every append. Fine for a year; it needs a
pruning or compaction plan before it isn't.

---

## Fine to leave, recorded so nobody re-derives them

- **`useLatestPrices` is unmemoized**, returning a fresh object each render, which makes the
  portfolio page's `useMemo` decorative — `buildPositions` runs twice per render (once
  directly, once inside `moneyWeightedReturnBps`) plus up to 300 solver iterations. Not
  pathological at realistic portfolio sizes, but the memo buys nothing today.
- **`lotsAtALoss` and `lotsNearingLongTerm` are exported, tested and unused.** The seed even
  shapes one lot at a loss "so `lotsAtALoss` has something to show" — and nothing shows it.
  Either surface them on `/portfolio` (tax-loss harvesting and holding-period alerts are the
  natural home) or delete them.
- **`portfolio:refresh.skipped` exists in both locales and is referenced nowhere.** The
  matching gap: clicking Refresh with only blank-ticker holdings returns silently. That key
  is the missing toast.
- **The seed imports `mockPriceFor` from the mock Google backend**, pulling mock code into
  the production bundle. Its comment also claims the seed always agrees with a refresh; it
  agrees on exactly one calendar day, because the seed prices off the real clock while the
  mock client prices off a pinned date.
- **`registry.tsx` borrows `observations:unknownSubject`** for a portfolio label. It works;
  the namespace boundary is wrong.
- **Deleting a holding does not cascade to its lots**, and `dataQualityChecks` has no
  orphan-lot or missing-price check, so nothing tells the user their lots are stranded.
- **Leap-day holding periods compress:** a lot bought 2024-02-28 and one bought 2024-02-29
  both become long-term on 2025-03-01. Inherent to anniversary-plus-clamp arithmetic.
- **XIRR brackets `[-0.99, 10]`.** A true IRR outside that — a position down more than
  99.9%, or up more than 1000%/year — returns `null` and renders as an em dash rather than a
  number. Fails safe.
- **Share arithmetic loses integer precision above ~$90M of notional in one position**, but
  because the product is divided by the share scale and rounded to the cent, the cent value
  stays exact until roughly $1e12. Measured against exact BigInt arithmetic and documented
  in `domain/value-objects/shares.ts`.

---

## Not yet verified by a human

Nothing on this branch has been clicked through in a browser. Automated verification covers
typecheck, 190 passing tests, lint, and a successful static export. These need eyes:

- Add a holding and a lot through Data Studio; confirm the shares field accepts `12.5` and
  the lot's cost is entered as a total, not a per-share price.
- Click "Refresh prices" against the real workbook. Confirm a price lands, the `__quotes` tab
  looks sane, and — because GOOGLEFINANCE needs a moment to fetch — that the new settle-and-
  retry window actually covers it on the first click.
- Confirm a bad ticker surfaces as a warning naming the ticker, not a silent failure.
- Confirm "Set price" is reachable on a position that already has a price, and that the
  dialog prefills with that price.
- Check both locales for raw i18n keys, and both themes for the tables and the donut.

---

## Added 2026-07-27 — portfolio CRUD entry points

The F2+F3 registry entries pointed `holding` and `lot` at `/portfolio`, which was built as a
read-only panel, so the forms existed with no route to reach them — nobody could add a
position through the UI at all. Fixed on `feat/portfolio-crud-entry` with two entry points:
`/holdings` and `/lots` list routes, plus "Add holding" and per-position "Add lot" on the
portfolio screen. Verified end to end in a browser.

That branch's whole-branch review also fixed: a required reference dropdown offering only
"None" and then rejecting it (a genuine cold-start dead end); holdings labelled by ticker
alone, so the same ticker in two accounts was indistinguishable and a purchase could be
booked to the wrong account; the new row action being unreachable on a phone; and a drawer
that remounted mid-save when the first holding flipped the page out of its empty state.

Still open from that review, none blocking:

- **pt-BR names overlap.** `holdingsPage.title` and `positions.title` are both "Posições";
  `lotsPage.title` and `lots.title` are both "Lotes". Two different screens carry the same
  name. en-US avoids it (Holdings vs Positions). A product-naming call, not a mechanical fix.
- **`/holdings` and `/lots` are not in the sidebar**, reachable only through Data Studio or
  the portfolio screen. Deliberate — the sidebar already carries Portfolio, and two more
  entries for sub-entities would crowd it.
- **Deleting a holding does not cascade to its lots.** The engines all filter orphans
  correctly, so no math breaks, but the lots stay in Dexie, keep syncing, and show as
  "Unknown item" on `/lots`. This is how the generic Data Studio deletes every entity, so it
  is a pre-existing model gap this feature newly exposes.
- **`SharesInput` and `MoneyInput` strip everything but digits, `.` and `-`.** A pt-BR user
  typing `12,5` gets 125, not 12.5. App-wide convention rather than a portfolio bug, but the
  portfolio is where fractional quantities actually matter.
