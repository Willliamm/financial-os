/**
 * Inline fixture builders for engine unit tests.
 * Each builder fills every required entity field with a sane default and lets
 * the caller override any subset.
 */

import type {
  Expense,
  Household,
  IncomeSource,
  InvestmentAccount,
  Loan,
  Property,
  Scenario,
  ScenarioAssumption,
  TaxAssumption,
  TaxStrategy,
} from "@/domain/entities";
import { emptyContext, type FinancialContext } from "@/domain/context";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

const base = () => ({
  version: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
});

export function makeHousehold(over: Partial<Household> = {}): Household {
  return {
    id: nextId("hh"),
    ...base(),
    name: "Test Household",
    baseCurrency: "USD",
    country: "US",
    state: "FL",
    city: "Tampa",
    filingStatus: "married_filing_jointly",
    ...over,
  };
}

export function makeIncome(over: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: nextId("inc"),
    ...base(),
    householdId: "hh-1",
    personId: null,
    name: "Salary",
    type: "w2",
    annualAmountCents: 20_000_000, // $200k
    growthRateBps: 300,
    startDate: null,
    endDate: null,
    taxTreatment: "ordinary",
    active: true,
    ...over,
  };
}

export function makeExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: nextId("exp"),
    ...base(),
    householdId: "hh-1",
    name: "Living",
    category: "housing",
    monthlyAmountCents: 500_000, // $5k
    inflationRateBps: 300,
    startDate: null,
    endDate: null,
    isDiscretionary: false,
    ...over,
  };
}

export function makeProperty(over: Partial<Property> = {}): Property {
  return {
    id: nextId("prop"),
    ...base(),
    householdId: "hh-1",
    name: "Rental A",
    propertyType: "sfh",
    ownershipType: "personal",
    street: "123 Main St",
    city: "Tampa",
    state: "FL",
    zip: "33601",
    purchaseDate: "2024-01-01",
    purchasePriceCents: 40_000_000, // $400k
    currentValueCents: 50_000_000, // $500k
    downPaymentCents: 8_000_000, // $80k
    closingCostsCents: 2_000_000, // $20k
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    yearBuilt: 2005,
    hoaMonthlyCents: 0,
    cddAnnualCents: 0,
    propertyTaxAnnualCents: 600_000, // $6k
    insuranceAnnualCents: 200_000, // $2k
    maintenanceAnnualCents: 300_000, // $3k
    appreciationRateBps: 300,
    rentMonthlyCents: 350_000, // $3.5k
    vacancyRateBps: 500, // 5%
    managementFeeBps: 800, // 8%
    status: "owned",
    notes: "",
    ...over,
  };
}

export function makeLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: nextId("loan"),
    ...base(),
    propertyId: null,
    lender: "Test Bank",
    loanType: "conventional",
    originalBalanceCents: 32_000_000, // $320k
    currentBalanceCents: 30_000_000, // $300k
    interestRateBps: 600, // 6%
    termMonths: 360,
    startDate: "2024-01-01",
    monthlyPaymentCents: 179_865, // ~ $1,798.65
    escrowMonthlyCents: 0,
    extraPaymentMonthlyCents: 0,
    ...over,
  };
}

export function makeInvestment(
  over: Partial<InvestmentAccount> = {},
): InvestmentAccount {
  return {
    id: nextId("inv"),
    ...base(),
    householdId: "hh-1",
    name: "Brokerage",
    accountType: "brokerage",
    institution: "Vanguard",
    currentBalanceCents: 10_000_000, // $100k
    expectedReturnBps: 700,
    contributionMonthlyCents: 200_000, // $2k
    taxTreatment: "taxable",
    ...over,
  };
}

export function makeTaxAssumption(
  over: Partial<TaxAssumption> = {},
): TaxAssumption {
  return {
    id: nextId("tax"),
    ...base(),
    householdId: "hh-1",
    year: 2025,
    filingStatus: "married_filing_jointly",
    federalEffectiveRateBps: 2200,
    stateEffectiveRateBps: 500,
    selfEmploymentTaxRateBps: 0,
    ficaRateBps: 765,
    standardDeductionCents: 2_920_000,
    itemizedDeductionCents: 0,
    ...over,
  };
}

export function makeTaxStrategy(over: Partial<TaxStrategy> = {}): TaxStrategy {
  return {
    id: nextId("strat"),
    ...base(),
    householdId: "hh-1",
    year: 2025,
    name: "Cost segregation",
    strategyType: "depreciation",
    estimatedDeductionCents: 5_000_000,
    estimatedTaxSavingsCents: 0,
    status: "planned",
    riskLevel: "medium",
    notes: "",
    ...over,
  };
}

export function makeScenario(over: Partial<Scenario> = {}): Scenario {
  return {
    id: nextId("scen"),
    ...base(),
    householdId: "hh-1",
    name: "Base case",
    description: "",
    startYear: 2025,
    endYear: 2035,
    baseScenarioId: null,
    status: "active",
    ...over,
  };
}

export function makeScenarioAssumption(
  over: Partial<ScenarioAssumption> = {},
): ScenarioAssumption {
  return {
    id: nextId("sa"),
    ...base(),
    scenarioId: "scen-1",
    key: "investment_return_bps",
    value: "700",
    valueType: "bps",
    ...over,
  };
}

export function makeContext(
  over: Partial<FinancialContext> = {},
): FinancialContext {
  return { ...emptyContext(), household: makeHousehold(), ...over };
}
