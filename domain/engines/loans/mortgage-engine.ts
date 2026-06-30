/**
 * Mortgage / amortizing-loan math.
 *
 * Pure functions. All money is integer US cents. All rates are basis points.
 */

import { bpsToRate, type BasisPoints } from "@/domain/value-objects/basis-points";
import type { MoneyCents } from "@/infrastructure/money/money";

/** A large sentinel meaning "never pays off" (payment too small to amortize). */
export const PAYOFF_NEVER = Number.POSITIVE_INFINITY;

/**
 * Standard amortizing principal-and-interest payment, in cents.
 * Handles 0% interest (principal / term).
 */
export function calculateMonthlyPayment(input: {
  principalCents: MoneyCents;
  annualRateBps: BasisPoints;
  termMonths: number;
}): MoneyCents {
  const { principalCents, annualRateBps, termMonths } = input;
  if (termMonths <= 0 || principalCents <= 0) return 0;
  const monthlyRate = bpsToRate(annualRateBps) / 12;
  if (monthlyRate === 0) {
    return Math.round(principalCents / termMonths);
  }
  const factor = Math.pow(1 + monthlyRate, termMonths);
  const payment = (principalCents * monthlyRate * factor) / (factor - 1);
  return Math.round(payment);
}

export interface AmortizationRow {
  monthIndex: number;
  paymentCents: MoneyCents;
  principalCents: MoneyCents;
  interestCents: MoneyCents;
  balanceCents: MoneyCents;
}

/**
 * Full amortization schedule. Stops when the balance reaches 0.
 * `monthIndex` is 1-based (first payment is month 1).
 */
export function buildAmortizationSchedule(input: {
  principalCents: MoneyCents;
  annualRateBps: BasisPoints;
  termMonths: number;
  extraMonthlyCents?: MoneyCents;
}): AmortizationRow[] {
  const { principalCents, annualRateBps, termMonths } = input;
  const extra = Math.max(0, input.extraMonthlyCents ?? 0);
  const rows: AmortizationRow[] = [];
  if (principalCents <= 0 || termMonths <= 0) return rows;

  const monthlyRate = bpsToRate(annualRateBps) / 12;
  const basePayment = calculateMonthlyPayment({
    principalCents,
    annualRateBps,
    termMonths,
  });

  let balance = principalCents;
  for (let month = 1; month <= termMonths && balance > 0; month++) {
    const interest = Math.round(balance * monthlyRate);
    let principalPaid = basePayment + extra - interest;
    if (principalPaid <= 0) {
      // Payment cannot cover interest; should not happen for a derived payment.
      break;
    }
    // On the final term month, clear any rounding remainder.
    if (principalPaid > balance || month === termMonths) {
      principalPaid = balance;
    }
    const payment = principalPaid + interest;
    balance -= principalPaid;
    rows.push({
      monthIndex: month,
      paymentCents: payment,
      principalCents: principalPaid,
      interestCents: interest,
      balanceCents: balance,
    });
  }
  return rows;
}

/** Remaining balance after `monthsElapsed` payments, in cents. */
export function remainingBalance(input: {
  principalCents: MoneyCents;
  annualRateBps: BasisPoints;
  termMonths: number;
  monthsElapsed: number;
  extraMonthlyCents?: MoneyCents;
}): MoneyCents {
  const { monthsElapsed } = input;
  if (monthsElapsed <= 0) return Math.max(0, input.principalCents);
  const schedule = buildAmortizationSchedule(input);
  if (monthsElapsed >= schedule.length) return 0;
  return schedule[monthsElapsed - 1].balanceCents;
}

/**
 * Months until a loan is paid off given a fixed payment.
 * Returns `PAYOFF_NEVER` (Infinity) if the payment cannot amortize the loan.
 */
export function payoffMonths(input: {
  principalCents: MoneyCents;
  annualRateBps: BasisPoints;
  monthlyPaymentCents: MoneyCents;
  extraMonthlyCents?: MoneyCents;
}): number {
  const { principalCents, annualRateBps, monthlyPaymentCents } = input;
  const extra = Math.max(0, input.extraMonthlyCents ?? 0);
  if (principalCents <= 0) return 0;
  const totalPayment = monthlyPaymentCents + extra;
  if (totalPayment <= 0) return PAYOFF_NEVER;

  const monthlyRate = bpsToRate(annualRateBps) / 12;
  let balance = principalCents;
  let months = 0;
  const cap = 12 * 100; // 100 years
  while (balance > 0 && months < cap) {
    const interest = Math.round(balance * monthlyRate);
    if (totalPayment <= interest) return PAYOFF_NEVER;
    let principalPaid = totalPayment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    months++;
  }
  return balance > 0 ? PAYOFF_NEVER : months;
}

export interface RefinanceResult {
  newMonthlyPaymentCents: MoneyCents;
  monthlySavingsCents: MoneyCents;
  totalInterestSavedCents: MoneyCents;
  breakEvenMonths: number;
}

/** Compare a current loan against a proposed refinance. */
export function calculateRefinanceImpact(input: {
  currentBalanceCents: MoneyCents;
  currentRateBps: BasisPoints;
  remainingTermMonths: number;
  newRateBps: BasisPoints;
  newTermMonths: number;
  closingCostsCents: MoneyCents;
}): RefinanceResult {
  const currentPayment = calculateMonthlyPayment({
    principalCents: input.currentBalanceCents,
    annualRateBps: input.currentRateBps,
    termMonths: input.remainingTermMonths,
  });
  const newPayment = calculateMonthlyPayment({
    principalCents: input.currentBalanceCents,
    annualRateBps: input.newRateBps,
    termMonths: input.newTermMonths,
  });

  const monthlySavings = currentPayment - newPayment;

  const currentTotalInterest =
    currentPayment * input.remainingTermMonths - input.currentBalanceCents;
  const newTotalInterest =
    newPayment * input.newTermMonths - input.currentBalanceCents;
  const totalInterestSaved = currentTotalInterest - newTotalInterest;

  const breakEvenMonths =
    monthlySavings > 0
      ? Math.ceil(input.closingCostsCents / monthlySavings)
      : Number.POSITIVE_INFINITY;

  return {
    newMonthlyPaymentCents: newPayment,
    monthlySavingsCents: monthlySavings,
    totalInterestSavedCents: totalInterestSaved,
    breakEvenMonths,
  };
}
