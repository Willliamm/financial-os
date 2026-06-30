import { z } from "zod";

/**
 * Zod schemas for every entity. These validate data coming from Google Sheets
 * before it enters IndexedDB, and back stop the forms. Money is integer cents,
 * percentages are integer basis points.
 *
 * IDs use a permissive string check rather than strict uuid so that a single
 * malformed value imported from a user-editable spreadsheet does not drop the
 * whole row. The app always generates UUIDs itself.
 */

const idString = z.string().min(1);
const isoString = z.string();
const cents = z.number().int();
const nonNegCents = z.number().int().nonnegative();
const bps = z.number().int();
const rateBps = z.number().int().min(0).max(1_000_000);

const baseEntityShape = {
  id: idString,
  version: z.number().int().nonnegative(),
  createdAt: isoString,
  updatedAt: isoString,
  deletedAt: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
};

export const filingStatusSchema = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
]);

export const householdSchema = z.object({
  ...baseEntityShape,
  name: z.string().min(1),
  baseCurrency: z.string().min(1).default("USD"),
  country: z.string().default("US"),
  state: z.string().default(""),
  city: z.string().default(""),
  filingStatus: filingStatusSchema.default("married_filing_jointly"),
});

export const personSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  email: z.string().default(""),
  role: z.string().default("member"),
  birthYear: z.number().int().min(1900).max(2100),
});

export const incomeTypeSchema = z.enum([
  "w2",
  "llc",
  "rental",
  "dividend",
  "interest",
  "bonus",
  "other",
]);

export const taxTreatmentSchema = z.enum([
  "ordinary",
  "qualified_dividend",
  "capital_gain",
  "tax_free",
]);

export const incomeSourceSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  personId: idString.nullable().default(null),
  name: z.string().min(1),
  type: incomeTypeSchema,
  annualAmountCents: nonNegCents,
  growthRateBps: bps.default(0),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  taxTreatment: taxTreatmentSchema.default("ordinary"),
  active: z.boolean().default(true),
});

export const expenseCategorySchema = z.enum([
  "housing",
  "utilities",
  "food",
  "transportation",
  "insurance",
  "healthcare",
  "debt",
  "discretionary",
  "business",
  "taxes",
  "property",
  "other",
]);

export const expenseSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  category: expenseCategorySchema.default("other"),
  monthlyAmountCents: nonNegCents,
  inflationRateBps: bps.default(0),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  isDiscretionary: z.boolean().default(false),
});

export const propertyTypeSchema = z.enum([
  "townhouse",
  "sfh",
  "condo",
  "multifamily",
]);
export const ownershipTypeSchema = z.enum(["personal", "llc"]);
export const propertyStatusSchema = z.enum(["prospect", "owned", "sold"]);

export const propertySchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  propertyType: propertyTypeSchema.default("sfh"),
  ownershipType: ownershipTypeSchema.default("personal"),
  street: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zip: z.string().default(""),
  purchaseDate: z.string().nullable().default(null),
  purchasePriceCents: nonNegCents,
  currentValueCents: nonNegCents,
  downPaymentCents: nonNegCents.default(0),
  closingCostsCents: nonNegCents.default(0),
  bedrooms: z.number().int().nonnegative().default(0),
  bathrooms: z.number().nonnegative().default(0),
  sqft: z.number().int().nonnegative().default(0),
  yearBuilt: z.number().int().default(0),
  hoaMonthlyCents: nonNegCents.default(0),
  cddAnnualCents: nonNegCents.default(0),
  propertyTaxAnnualCents: nonNegCents.default(0),
  insuranceAnnualCents: nonNegCents.default(0),
  maintenanceAnnualCents: nonNegCents.default(0),
  appreciationRateBps: bps.default(300),
  rentMonthlyCents: nonNegCents.default(0),
  vacancyRateBps: rateBps.default(500),
  managementFeeBps: rateBps.default(0),
  status: propertyStatusSchema.default("prospect"),
  notes: z.string().default(""),
});

export const loanTypeSchema = z.enum([
  "conventional",
  "fha",
  "va",
  "heloc",
  "private",
  "other",
]);

export const loanSchema = z.object({
  ...baseEntityShape,
  propertyId: idString.nullable().default(null),
  lender: z.string().default(""),
  loanType: loanTypeSchema.default("conventional"),
  originalBalanceCents: nonNegCents,
  currentBalanceCents: nonNegCents,
  interestRateBps: rateBps,
  termMonths: z.number().int().nonnegative().default(360),
  startDate: z.string().nullable().default(null),
  monthlyPaymentCents: nonNegCents.default(0),
  escrowMonthlyCents: nonNegCents.default(0),
  extraPaymentMonthlyCents: nonNegCents.default(0),
});

export const accountTypeSchema = z.enum([
  "brokerage",
  "401k",
  "solo_401k",
  "ira",
  "roth_ira",
  "hsa",
  "cash_balance_plan",
  "cash",
  "crypto",
  "other",
]);

export const investmentAccountSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  accountType: accountTypeSchema.default("brokerage"),
  institution: z.string().default(""),
  currentBalanceCents: nonNegCents,
  expectedReturnBps: bps.default(700),
  contributionMonthlyCents: nonNegCents.default(0),
  taxTreatment: z
    .enum(["taxable", "tax_deferred", "tax_free"])
    .default("taxable"),
});

export const strategyStatusSchema = z.enum([
  "idea",
  "planned",
  "active",
  "completed",
]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const taxStrategySchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  year: z.number().int().min(1900).max(2200),
  name: z.string().min(1),
  strategyType: z.string().default(""),
  estimatedDeductionCents: nonNegCents.default(0),
  estimatedTaxSavingsCents: nonNegCents.default(0),
  status: strategyStatusSchema.default("idea"),
  riskLevel: riskLevelSchema.default("low"),
  notes: z.string().default(""),
});

export const taxAssumptionSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  year: z.number().int().min(1900).max(2200),
  filingStatus: filingStatusSchema.default("married_filing_jointly"),
  federalEffectiveRateBps: rateBps.default(2200),
  stateEffectiveRateBps: rateBps.default(500),
  selfEmploymentTaxRateBps: rateBps.default(0),
  ficaRateBps: rateBps.default(765),
  standardDeductionCents: nonNegCents.default(2_920_000),
  itemizedDeductionCents: nonNegCents.default(0),
});

export const scenarioStatusSchema = z.enum(["draft", "active", "archived"]);

export const scenarioSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  description: z.string().default(""),
  startYear: z.number().int(),
  endYear: z.number().int(),
  baseScenarioId: idString.nullable().default(null),
  status: scenarioStatusSchema.default("draft"),
});

export const scenarioAssumptionSchema = z.object({
  ...baseEntityShape,
  scenarioId: idString,
  key: z.string().min(1),
  value: z.string().default(""),
  valueType: z
    .enum(["string", "number", "boolean", "bps", "cents"])
    .default("string"),
});

export const projectionSnapshotSchema = z.object({
  ...baseEntityShape,
  scenarioId: idString,
  year: z.number().int(),
  netWorthCents: cents,
  totalAssetsCents: cents,
  totalLiabilitiesCents: cents,
  activeIncomeCents: cents,
  passiveIncomeCents: cents,
  estimatedTaxCents: cents,
  investableCashflowCents: cents,
});

import type { EntityType } from "@/domain/entities/base";
import type { ZodType } from "zod";

/** Lookup table of schema by entity type, for the generic importer/mapper. */
export const ENTITY_SCHEMAS: Record<EntityType, ZodType> = {
  household: householdSchema,
  person: personSchema,
  income_source: incomeSourceSchema,
  expense: expenseSchema,
  property: propertySchema,
  loan: loanSchema,
  investment_account: investmentAccountSchema,
  tax_strategy: taxStrategySchema,
  tax_assumption: taxAssumptionSchema,
  scenario: scenarioSchema,
  scenario_assumption: scenarioAssumptionSchema,
  projection_snapshot: projectionSnapshotSchema,
};
