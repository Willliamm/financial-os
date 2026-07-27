/**
 * Money-weighted return (XIRR).
 *
 * Pure. This answers "what did MY decisions earn", because it weights each
 * dollar by how long it was invested. It is deliberately different from a
 * time-weighted return, which judges the instrument instead of the investor.
 * Both are useful; only this one is implemented today.
 */

import type { FinancialContext } from "@/domain/context";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { diffCalendarDays } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";
import {
  buildPositions,
  lotCostBasisCents,
  portfolioValueCents,
  type PriceMap,
} from "./portfolio-engine";

export interface CashFlow {
  date: string;
  /** Negative for money put in, positive for money taken out or final value. */
  amountCents: MoneyCents;
}

const DAYS_PER_YEAR = 365;
const MAX_NEWTON_ITERATIONS = 100;
const MAX_BISECTION_ITERATIONS = 200;
const NPV_TOLERANCE = 1e-7;
const RATE_TOLERANCE = 1e-9;

/**
 * Internal rate of return on irregularly spaced flows. Newton-Raphson first,
 * bisection over [-0.99, 10] as a fallback when Newton wanders off. Returns
 * the annual rate as a decimal (0.087 = 8.7%), or null when it cannot
 * converge, when there are fewer than two flows, or when all flows share a
 * sign (no sign change means no root).
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amountCents > 0)) return null;
  if (!flows.some((f) => f.amountCents < 0)) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const origin = sorted[0].date;
  const years = sorted.map(
    (f) => diffCalendarDays(origin, f.date) / DAYS_PER_YEAR,
  );
  const amounts = sorted.map((f) => f.amountCents);

  const npv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < amounts.length; i++) {
      sum += amounts[i] / Math.pow(1 + rate, years[i]);
    }
    return sum;
  };

  let rate = guess;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    if (rate <= -0.999999) break;
    const value = npv(rate);
    if (!Number.isFinite(value)) break;
    if (Math.abs(value) < NPV_TOLERANCE) return rate;

    let derivative = 0;
    for (let j = 0; j < amounts.length; j++) {
      derivative -= (years[j] * amounts[j]) / Math.pow(1 + rate, years[j] + 1);
    }
    if (derivative === 0 || !Number.isFinite(derivative)) break;

    const next = rate - value / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < RATE_TOLERANCE) return next;
    rate = next;
  }

  let low = -0.99;
  let high = 10;
  let fLow = npv(low);
  const fHigh = npv(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < NPV_TOLERANCE || (high - low) / 2 < RATE_TOLERANCE) {
      return mid;
    }
    if (fLow * fMid <= 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Money-weighted return of the whole portfolio: every open lot's cost is an
 * outflow on its trade date, and the current market value is a single inflow
 * on `asOf`. Returns bps, or null when there is nothing to measure.
 */
export function moneyWeightedReturnBps(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): BasisPoints | null {
  const openLots = context.lots.filter((l) => !l.deletedAt && l.status === "open");
  if (openLots.length === 0) return null;

  const value = portfolioValueCents(buildPositions(context, prices));
  if (value <= 0) return null;

  const flows: CashFlow[] = openLots.map((lot) => ({
    date: lot.tradeDate,
    amountCents: -lotCostBasisCents(lot),
  }));
  flows.push({ date: asOf, amountCents: value });

  const rate = xirr(flows);
  return rate === null ? null : Math.round(rate * 10_000);
}
