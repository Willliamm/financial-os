import type {
  Expense,
  Household,
  IncomeSource,
  InvestmentAccount,
  Loan,
  Person,
  Property,
  Scenario,
  ScenarioAssumption,
  TaxAssumption,
  TaxStrategy,
} from "@/domain/entities";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { metadataRepo, META_KEYS } from "@/infrastructure/db/metadata-repo";
import { dollarsToCents } from "@/infrastructure/money/money";
import { percentToBps } from "@/domain/value-objects/basis-points";
import { currentYear } from "@/infrastructure/dates/date-utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("seed");

const $ = dollarsToCents;
const pct = percentToBps;

/**
 * Seed a realistic demo household once, so a brand-new user sees a populated,
 * working app instead of empty screens. Idempotent via a metadata flag.
 */
export async function seedDemoDataIfEmpty(): Promise<boolean> {
  const seeded = await metadataRepo.get(META_KEYS.seeded);
  const householdCount = await repositories.household.count();
  if (seeded === "true" || householdCount > 0) return false;

  log.info("Seeding demo data");
  const year = currentYear();

  const { entity: household } = await createEntity<Household>("household", {
    name: "Rivera Household",
    baseCurrency: "USD",
    country: "US",
    state: "FL",
    city: "Clermont",
    filingStatus: "married_filing_jointly",
  });

  const { entity: primary } = await createEntity<Person>("person", {
    householdId: household.id,
    name: "Alex Rivera",
    email: "alex@example.com",
    role: "primary",
    birthYear: 1986,
  });
  await createEntity<Person>("person", {
    householdId: household.id,
    name: "Sam Rivera",
    email: "sam@example.com",
    role: "spouse",
    birthYear: 1988,
  });

  // Income
  await createEntity<IncomeSource>("income_source", {
    householdId: household.id,
    personId: primary.id,
    name: "W-2 Salary",
    type: "w2",
    annualAmountCents: $(165000),
    growthRateBps: pct(3),
    taxTreatment: "ordinary",
    active: true,
  });
  await createEntity<IncomeSource>("income_source", {
    householdId: household.id,
    personId: primary.id,
    name: "Consulting LLC",
    type: "llc",
    annualAmountCents: $(85000),
    growthRateBps: pct(8),
    taxTreatment: "ordinary",
    active: true,
  });
  await createEntity<IncomeSource>("income_source", {
    householdId: household.id,
    personId: null,
    name: "Brokerage Dividends",
    type: "dividend",
    annualAmountCents: $(9000),
    growthRateBps: pct(5),
    taxTreatment: "qualified_dividend",
    active: true,
  });

  // Expenses
  const expenses: Array<Partial<Expense>> = [
    { name: "Mortgage + Escrow", category: "housing", monthlyAmountCents: $(2600), isDiscretionary: false },
    { name: "Groceries", category: "food", monthlyAmountCents: $(1100), isDiscretionary: false },
    { name: "Utilities", category: "utilities", monthlyAmountCents: $(420), isDiscretionary: false },
    { name: "Auto + Fuel", category: "transportation", monthlyAmountCents: $(650), isDiscretionary: false },
    { name: "Health Insurance", category: "healthcare", monthlyAmountCents: $(780), isDiscretionary: false },
    { name: "Dining + Entertainment", category: "discretionary", monthlyAmountCents: $(900), isDiscretionary: true },
    { name: "Travel", category: "discretionary", monthlyAmountCents: $(600), isDiscretionary: true },
  ];
  for (const e of expenses) {
    await createEntity<Expense>("expense", {
      householdId: household.id,
      inflationRateBps: pct(3),
      ...e,
    });
  }

  // Properties
  const { entity: townhouse } = await createEntity<Property>("property", {
    householdId: household.id,
    name: "Wellness Ridge Townhouse",
    propertyType: "townhouse",
    ownershipType: "personal",
    street: "123 Ridge Way",
    city: "Clermont",
    state: "FL",
    zip: "34711",
    purchasePriceCents: $(370000),
    currentValueCents: $(388000),
    downPaymentCents: $(74000),
    closingCostsCents: $(9000),
    bedrooms: 3,
    bathrooms: 2.5,
    sqft: 1800,
    yearBuilt: 2024,
    hoaMonthlyCents: $(280),
    propertyTaxAnnualCents: $(4600),
    insuranceAnnualCents: $(2400),
    maintenanceAnnualCents: $(3000),
    appreciationRateBps: pct(3.5),
    rentMonthlyCents: $(2500),
    vacancyRateBps: pct(5),
    managementFeeBps: pct(8),
    status: "owned",
    notes: "First rental — house-hacked the first year.",
  });

  await createEntity<Property>("property", {
    householdId: household.id,
    name: "Lakeside Single-Family (Prospect)",
    propertyType: "sfh",
    ownershipType: "llc",
    street: "88 Lakeside Dr",
    city: "Winter Garden",
    state: "FL",
    zip: "34787",
    purchasePriceCents: $(525000),
    currentValueCents: $(525000),
    downPaymentCents: $(131250),
    closingCostsCents: $(13000),
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2400,
    yearBuilt: 2019,
    hoaMonthlyCents: $(0),
    propertyTaxAnnualCents: $(6800),
    insuranceAnnualCents: $(3200),
    maintenanceAnnualCents: $(4200),
    appreciationRateBps: pct(4),
    rentMonthlyCents: $(3300),
    vacancyRateBps: pct(6),
    managementFeeBps: pct(8),
    status: "prospect",
    notes: "Candidate BRRRR-style acquisition for next year.",
  });

  // Loan on the townhouse
  await createEntity<Loan>("loan", {
    propertyId: townhouse.id,
    lender: "First Coast Mortgage",
    loanType: "conventional",
    originalBalanceCents: $(296000),
    currentBalanceCents: $(284500),
    interestRateBps: pct(6.25),
    termMonths: 360,
    monthlyPaymentCents: $(1822),
    escrowMonthlyCents: $(583),
    extraPaymentMonthlyCents: $(0),
  });

  // Investment accounts
  const accounts: Array<Partial<InvestmentAccount>> = [
    { name: "Employer 401(k)", accountType: "401k", institution: "Fidelity", currentBalanceCents: $(212000), expectedReturnBps: pct(7), contributionMonthlyCents: $(1900), taxTreatment: "tax_deferred" },
    { name: "Taxable Brokerage", accountType: "brokerage", institution: "Schwab", currentBalanceCents: $(96000), expectedReturnBps: pct(7), contributionMonthlyCents: $(1500), taxTreatment: "taxable" },
    { name: "Roth IRA", accountType: "roth_ira", institution: "Vanguard", currentBalanceCents: $(58000), expectedReturnBps: pct(7), contributionMonthlyCents: $(580), taxTreatment: "tax_free" },
    { name: "HSA", accountType: "hsa", institution: "Lively", currentBalanceCents: $(21000), expectedReturnBps: pct(6), contributionMonthlyCents: $(350), taxTreatment: "tax_free" },
    { name: "Cash Reserve", accountType: "cash", institution: "Ally", currentBalanceCents: $(45000), expectedReturnBps: pct(4), contributionMonthlyCents: $(500), taxTreatment: "taxable" },
  ];
  for (const a of accounts) {
    await createEntity<InvestmentAccount>("investment_account", {
      householdId: household.id,
      ...a,
    });
  }

  // Tax assumption + strategies
  await createEntity<TaxAssumption>("tax_assumption", {
    householdId: household.id,
    year,
    filingStatus: "married_filing_jointly",
    federalEffectiveRateBps: pct(22),
    stateEffectiveRateBps: pct(0),
    selfEmploymentTaxRateBps: pct(15.3),
    ficaRateBps: pct(7.65),
    standardDeductionCents: $(29200),
    itemizedDeductionCents: $(0),
  });

  const strategies: Array<Partial<TaxStrategy>> = [
    { name: "Solo 401(k) for LLC", strategyType: "retirement", estimatedDeductionCents: $(23000), estimatedTaxSavingsCents: $(7000), status: "planned", riskLevel: "low" },
    { name: "S-Corp Election", strategyType: "entity", estimatedDeductionCents: $(0), estimatedTaxSavingsCents: $(6500), status: "idea", riskLevel: "medium" },
    { name: "Real Estate Depreciation", strategyType: "real_estate", estimatedDeductionCents: $(13000), estimatedTaxSavingsCents: $(3100), status: "active", riskLevel: "low" },
    { name: "HSA Max Contribution", strategyType: "health", estimatedDeductionCents: $(8300), estimatedTaxSavingsCents: $(1900), status: "active", riskLevel: "low" },
  ];
  for (const s of strategies) {
    await createEntity<TaxStrategy>("tax_strategy", {
      householdId: household.id,
      year,
      notes: "",
      ...s,
    });
  }

  // A baseline scenario with assumptions
  const { entity: scenario } = await createEntity<Scenario>("scenario", {
    householdId: household.id,
    name: "Base Plan",
    description: "Current trajectory with steady contributions.",
    startYear: year,
    endYear: year + 20,
    baseScenarioId: null,
    status: "active",
  });
  const assumptions: Array<[string, string, ScenarioAssumption["valueType"]]> = [
    ["investment_return_bps", String(pct(7)), "bps"],
    ["income_growth_bps", String(pct(4)), "bps"],
    ["expense_inflation_bps", String(pct(3)), "bps"],
    ["property_appreciation_bps", String(pct(3.5)), "bps"],
    ["years", "20", "number"],
  ];
  for (const [key, value, valueType] of assumptions) {
    await createEntity<ScenarioAssumption>("scenario_assumption", {
      scenarioId: scenario.id,
      key,
      value,
      valueType,
    });
  }

  await metadataRepo.set(META_KEYS.seeded, "true");
  log.info("Demo data seeded");
  return true;
}
