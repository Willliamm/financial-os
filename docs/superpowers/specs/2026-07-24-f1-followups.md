# F1 (Observations) — open follow-ups

**Date:** 2026-07-24
**Branch:** `feat/f1-observations`
**Status:** feature complete and verified; the items below were deliberately left out of scope.

The F1 implementation passed a per-task review for each of its 11 tasks plus a
whole-branch review. Everything the whole-branch review classified as a
correctness defect was fixed before merge. What remains falls into two groups:
product decisions that are not mine to make, and cosmetics. They are recorded
here so they are tracked rather than rediscovered by a user.

---

## Product decisions — need a call before they can be fixed

### P1 — The dashboard shows two "net worth" numbers that disagree

`app/(app)/dashboard/page.tsx`

The net-worth KPI sums every asset and liability. The "Net worth history" card
beside it only sums *marked* subjects, because history reflects only what was
observed — that honesty is the design (spec D2). On a partially marked portfolio
the two numbers can differ by a lot, and the only cue is marker opacity plus the
hover tooltip.

Neither number is wrong. The presentation is. Options:

1. Put the coverage ratio in the card header — "Net worth history · 2 of 8 marked".
2. Draw the current full net worth as a reference line on the chart.
3. Hide the history card until coverage passes some threshold.

Option 1 is the cheapest and keeps the honesty. Recommended.

### P2 — The freshness banner's call to action leads nowhere

`components/shared/freshness-banner.tsx`

The banner names stale *subjects* ("Employer 401(k), Roth IRA, HSA") and links to
`/observations`, which lists existing *marks* — precisely the list that does not
contain those subjects. There is no path from the banner to marking anything.

`assessFreshness` already returns everything a per-subject staleness view needs,
and these i18n keys were added in both locales and never used, which is what such
a view would consume:

- `observations:freshness.fresh` / `.aging` / `.stale` / `.never`
- `observations:freshness.lastMarked` / `.ageDays`
- `forms:columns.lastMarked`

Either build that view and use the keys, or delete them. Leaving them is the
worst option.

### P3 — Where the confidence figure lives

`components/shared/freshness-banner.tsx`

"Data confidence" renders only inside the banner, and the banner only renders when
something is stale. A household whose data is entirely *aging* sees no banner and
never learns its confidence is 50% — the number is unreachable exactly when it
would be most useful. Moving it to a KPI tile or the history card header fixes
both this and the coherence complaint that the banner's title counts only stale
subjects while the figure weights every row.

### P4 — Marking bypasses the soft lock

`features/observations/use-mark-value.ts`

Every edit through the Data Studio drawer acquires a soft lock for `type:id`
(`features/data-studio/entity-form-drawer.tsx`). Marking writes through to the
subject's current-value field without one, so a second tab holding the edit lock
is silently overwritten. This contradicts the data-flow documented in
`CLAUDE.md`. Fixing it means threading lock acquisition into the mark path.

---

## Cosmetics and small cleanups

- **Two toasts per mark.** `create` and `update` each toast, so one user action
  produces two. Also `create` does not pass `{ sync: true }` while `update` does,
  so a *backdated* mark triggers no immediate sync. Harmless — the queue drains on
  the next cycle — but inconsistent.
- **Plural key convention.** `observations.json` uses bare `bannerTitle` +
  `bannerTitle_other`; every other namespace uses `_one` / `_other`. It resolves
  correctly (the bare key is i18next's fallback when `_one` is absent) but it
  works by accident.
- **Dead code.** `addDaysIso` is production-unused (tested only);
  `HistoryOptions.granularity` is declared and never read; the chart tooltip
  destructures `axisValue` and never uses it; the `entities:observationSource.*`
  block is unreferenced.
- **Mark buttons are a wall.** The investments and loans screens render one
  button per entity in the page header. `EntityList` already has a row-actions
  menu — that is where this belongs, per spec §5.5.
- **Empty grid cell.** The history card starts a new dashboard row and leaves the
  third column empty. Needs eyes, not analysis.
- **Icon class idiom.** `freshness-banner.tsx` uses `h-4 w-4`; the sibling
  `lock-banner.tsx` and the `Alert` primitive use `size-4`.
- **Redundant guards.** `monthEndsBetween` keeps an `if (day >= from)` check that
  is always true by construction; `property/page.tsx` guards on `property` after
  an early return already narrowed it non-null.

---

## Not delivered from spec §5.5 / §9

- Per-property history sparkline on the property detail page.
- Nav places "Marks" in Overview rather than at the end of a Data section.
- Two spec'd test cases are absent: `planConfidenceBps` with an all-aging set
  (5000), and a backdated-observation bucketing case.

---

## Deliberately accepted, with reasoning

These were raised in review and ruled fine to leave:

- **`totalSubjects` counts today's subjects at historical points**, so an account
  added later inflates the denominator for earlier points. This follows from D2 —
  history reflects only what was observed. It is the presentation (P1) that
  misleads, not the number.
- **The mark and the current-value write are two commands, not one atomic pair.**
  Deliberate per spec D1. If the second fails, the mark survives without the
  write-through and the user can retry.
- **The runtime-keyed patch object loses compile-time field-name checking.**
  Mitigated by a unit test asserting every literal in `SUBJECT_VALUE_FIELD`.
- **`notDeleted` is duplicated across engines.** Already the house pattern in
  `net-worth-engine.ts` and `data-quality-checker.ts`. Worth extracting to a
  shared history util when a third engine lands.
- **Same-day tie-break** for two marks on one subject is implementation-defined
  (last wins). Unexercised; worth a comment when someone touches it.

---

## Still unverified by a human

Nothing in this branch has been clicked through in a browser. Automated
verification covers typecheck, 107 passing tests, lint, and a successful static
export. These need eyes:

- Marking a value: the toast, the list balance updating, the Sync Center pending
  count going up by two.
- `/observations` rendering real rows in both locales, with no raw i18n keys and
  working select / date / money controls.
- The history chart with one or two points, and whether a 0.35-alpha marker is
  actually visible in both light and dark themes.
- The seeded demo opening with the freshness banner hidden.
