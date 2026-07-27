# Portfolio CRUD Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to add a holding and a lot through the UI. Today the forms exist and the lists work, but nothing routes to them — the Data Studio cards for Holdings and Lots link to `/portfolio`, which is a read-only overview with no form.

**Architecture:** Two complementary entry points. Route-level list screens (`/holdings`, `/lots`) reuse the generic Data Studio `ListScreen`, exactly as `/observations` does — that fixes the Data Studio cards and gives a browse/edit/delete surface. On top of that, the `/portfolio` screen gets in-context "Add holding" and per-position "Add lot" actions that open the same `EntityFormDrawer` directly, so the natural path does not require a detour through Data Studio.

**Tech Stack:** Next.js 15 (static export) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · react-i18next · Vitest.

**Why this exists:** the F2+F3 plan set `href: "/portfolio"` on both registry entries assuming that screen would host the CRUD; the screen was built as a read-only panel. Each decision was defensible alone; together they left a dead end. Recorded in `docs/superpowers/specs/2026-07-27-f2-f3-followups.md`.

## Global Constraints

- Money is integer US cents; shares are integer millionths; ratios are integer basis points.
- Every mutation goes through the command pipeline — `EntityFormDrawer` already does this via `useEntityActions`. Do not add a second write path.
- `domain/` stays pure: no React, Dexie, Google, or `features/` imports.
- No `[id]` dynamic routes — this is a static export (`output: "export"`).
- Client components only.
- Every i18n key must exist in BOTH `lib/i18n/messages/en-US/` and `lib/i18n/messages/pt-BR/`.
- Verify loop: `npm run typecheck && npm run test && npm run lint`. Do NOT start a dev server; a human verifies the screens in a browser afterwards.
- The suite is at **190 passing tests**. It must never go down.

---

### Task 1: Route-level list screens for holdings and lots

Fixes the dead Data Studio cards and gives each entity a browsable list.

**Files:**
- Create: `app/(app)/holdings/page.tsx`
- Create: `app/(app)/lots/page.tsx`
- Modify: `features/data-studio/registry.tsx`
- Modify: `lib/i18n/messages/en-US/portfolio.json`
- Modify: `lib/i18n/messages/pt-BR/portfolio.json`

**Interfaces:**
- Consumes: `ListScreen` from `@/features/data-studio/list-screen`; the existing `holding` and `lot` registry configs; `selectEntities` already has both cases.
- Produces: the `/holdings` and `/lots` routes; `ENTITY_REGISTRY.holding.href === "/holdings"` and `.lot.href === "/lots"`.

- [ ] **Step 1: Add the i18n keys**

In `lib/i18n/messages/en-US/portfolio.json`, add four keys at the top level (do NOT nest them under the existing `lots` object — `lots.title` already means the lots *card* on the portfolio screen, and reusing it would make one string serve two different headings):

```json
  "holdingsPage": {
    "title": "Holdings",
    "description": "Every position you own, and which account holds it."
  },
  "lotsPage": {
    "title": "Lots",
    "description": "Each purchase, with its share count and what you paid."
  },
```

In `lib/i18n/messages/pt-BR/portfolio.json`, the same structure:

```json
  "holdingsPage": {
    "title": "Posições",
    "description": "Cada papel que você tem, e em qual conta ele está."
  },
  "lotsPage": {
    "title": "Lotes",
    "description": "Cada compra, com a quantidade de cotas e o quanto você pagou."
  },
```

- [ ] **Step 2: Create the holdings route**

Create `app/(app)/holdings/page.tsx`:

```tsx
"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function HoldingsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="holding"
      title={t("portfolio:holdingsPage.title")}
      description={t("portfolio:holdingsPage.description")}
    />
  );
}
```

- [ ] **Step 3: Create the lots route**

Create `app/(app)/lots/page.tsx`:

```tsx
"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function LotsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="lot"
      title={t("portfolio:lotsPage.title")}
      description={t("portfolio:lotsPage.description")}
    />
  );
}
```

- [ ] **Step 4: Point the registry at the new routes**

In `features/data-studio/registry.tsx`, the `holding` config currently has `href: "/portfolio"` — change it to `href: "/holdings"`. The `lot` config likewise changes from `href: "/portfolio"` to `href: "/lots"`.

That `href` is what the Data Studio card's "Edit" link uses, so this is the change that makes those two cards reach a form at all.

Do NOT add nav entries for these routes. The sidebar already carries Portfolio; two more items for what are effectively sub-entities would crowd it, and Task 2 gives the in-context path that most users will take.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean, 190 tests still passing (this task adds no tests).

Do NOT start a dev server.

- [ ] **Step 6: Commit**

```bash
git add app features/data-studio/registry.tsx lib/i18n
git commit -m "feat(portfolio): add holdings and lots list routes"
```

---

### Task 2: Add holding and add lot from the portfolio screen

The in-context path: add a position without leaving the screen that shows your positions.

**Files:**
- Modify: `app/(app)/portfolio/page.tsx`
- Modify: `features/portfolio/positions-table.tsx`
- Modify: `lib/i18n/messages/en-US/portfolio.json`
- Modify: `lib/i18n/messages/pt-BR/portfolio.json`

**Interfaces:**
- Consumes: `EntityFormDrawer` from `@/features/data-studio/entity-form-drawer`, whose props are `{ config, open, onOpenChange, entity?, context, injectDefaults?, onSaved? }`; `getEntityConfig` from `@/features/data-studio/registry`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the i18n keys**

Add to BOTH locale `portfolio.json` files, at the top level:

en-US:
```json
  "addHolding": "Add holding",
  "addLot": "Add lot",
```

pt-BR:
```json
  "addHolding": "Adicionar posição",
  "addLot": "Adicionar lote",
```

- [ ] **Step 2: Add an "Add lot" row action to the positions table**

In `features/portfolio/positions-table.tsx`, extend `PositionsTableProps` with:

```tsx
  onAddLot: (holdingId: string) => void;
```

The table already renders a "Set price" control per row. Add a second small ghost button beside it — in the same cell, or in a new trailing actions cell if that reads better — labelled `t("portfolio:addLot")`, calling `onAddLot(p.holdingId)`. Keep it available on every row regardless of `hasPrice`: adding a lot has nothing to do with whether a price is known.

- [ ] **Step 3: Wire both drawers into the portfolio page**

In `app/(app)/portfolio/page.tsx`:

Add the imports:

```tsx
import { EntityFormDrawer } from "@/features/data-studio/entity-form-drawer";
import { getEntityConfig } from "@/features/data-studio/registry";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
```

Add state next to the existing `settingPriceFor` state — declare these BEFORE the empty-state early return, so no hook or state sits after a conditional return:

```tsx
const [addingHolding, setAddingHolding] = useState(false);
const [addingLotFor, setAddingLotFor] = useState<string | null>(null);
```

Add an "Add holding" button to the page header, beside the existing "Refresh prices" button:

```tsx
<Button variant="outline" size="sm" onClick={() => setAddingHolding(true)}>
  <Plus className="size-4" />
  {t("portfolio:addHolding")}
</Button>
```

Render both drawers near the existing `SetPriceDialog`:

```tsx
<EntityFormDrawer
  config={getEntityConfig("holding")}
  open={addingHolding}
  onOpenChange={setAddingHolding}
  entity={null}
  context={context}
/>

<EntityFormDrawer
  config={getEntityConfig("lot")}
  open={addingLotFor !== null}
  onOpenChange={(open) => setAddingLotFor(open ? addingLotFor : null)}
  entity={null}
  context={context}
  injectDefaults={addingLotFor ? { holdingId: addingLotFor } : undefined}
/>
```

Pass `onAddLot={setAddingLotFor}` to `PositionsTable`.

`injectDefaults` is what prefills the lot's holding, so adding a lot from a position row does not make the user re-pick the position they just clicked.

- [ ] **Step 4: Make the empty state actionable**

The page currently early-returns an `EmptyState` when there are no positions — which is exactly when a new user arrives, and exactly when they most need the button. Give that `EmptyState` an `action` prop containing the same "Add holding" button, and render the holding drawer in that branch too so the button works.

`EmptyState`'s props are `{ icon?, title, description?, action?, className? }`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean, 190 tests still passing.

Do NOT start a dev server.

- [ ] **Step 6: Commit**

```bash
git add app features/portfolio lib/i18n
git commit -m "feat(portfolio): add holding and lot creation from the portfolio screen"
```

---

## Done criteria

- [ ] The Data Studio cards for Holdings and Lots reach a working list with an Add button.
- [ ] `/holdings` and `/lots` render, list existing rows, and create/edit/delete through the command pipeline.
- [ ] `/portfolio` has an "Add holding" button that works both when positions exist and when the empty state is showing.
- [ ] Each position row offers "Add lot", and the drawer opens with that holding already selected.
- [ ] Both locales carry every new key; no raw key is visible.
- [ ] `npm run typecheck && npm run test && npm run lint` pass; 190 tests still green.
- [ ] `npm run build` produces the static export including `/holdings` and `/lots`.

## Human verification (after the plan completes)

- Add a holding for a real ticker, then add a lot to it, and confirm both appear on `/portfolio`.
- Confirm the shares field accepts `12.5` and the cost field is the total paid, not a per-share price.
- Check both locales for raw i18n keys.
