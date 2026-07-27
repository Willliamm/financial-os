import type {
  Expense,
  Holding,
  Household,
  IncomeSource,
  InvestmentAccount,
  Loan,
  Lot,
  Observation,
  Person,
  PriceQuote,
  Property,
  Scenario,
  ScenarioAssumption,
  TaxAssumption,
  TaxStrategy,
} from "@/domain/entities";
import { createEntity, updateEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { metadataRepo, META_KEYS } from "@/infrastructure/db/metadata-repo";
import { dollarsToCents } from "@/infrastructure/money/money";
import { percentToBps } from "@/domain/value-objects/basis-points";
import { sharesToMicros, sharesValueCents } from "@/domain/value-objects/shares";
import { addMonthsIso, currentYear, todayIsoDate } from "@/infrastructure/dates/date-utils";
import { mockPriceFor } from "@/infrastructure/google/mocks/mock-backend";
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

  const { entity: lakeside } = await createEntity<Property>("property", {
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
  const { entity: townhouseLoan } = await createEntity<Loan>("loan", {
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
  const accountEntities: InvestmentAccount[] = [];
  for (const a of accounts) {
    const { entity } = await createEntity<InvestmentAccount>(
      "investment_account",
      { householdId: household.id, ...a },
    );
    accountEntities.push(entity);
  }

  // Dated off the clock (not hardcoded) so the demo doesn't visibly "age" as
  // the calendar turns — both the portfolio's lot trade dates below and the
  // observation marks further down depend on this.
  const today = todayIsoDate();

  // Portfolio: give the taxable brokerage real holdings and lots instead of
  // just a balance, so the portfolio screen (allocation, gain/loss, holding
  // periods) has something to show. Quote prices come from the same mock
  // pricing function a real "refresh prices" would hit, so the seed always
  // agrees with a refresh.
  const brokerage = accountEntities.find((a) => a.accountType === "brokerage")!;

  const vooPriceCents = Math.round(mockPriceFor("VOO", today) * 100);
  const bndPriceCents = Math.round(mockPriceFor("BND", today) * 100);
  const vxusPriceCents = Math.round(mockPriceFor("VXUS", today) * 100);

  const { entity: vooHolding } = await createEntity<Holding>("holding", {
    accountId: brokerage.id,
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    assetClass: "us_equity",
    targetAllocationBps: pct(60),
  });
  const { entity: bndHolding } = await createEntity<Holding>("holding", {
    accountId: brokerage.id,
    ticker: "BND",
    name: "Vanguard Total Bond Market ETF",
    assetClass: "bond",
    targetAllocationBps: pct(30),
  });
  const { entity: vxusHolding } = await createEntity<Holding>("holding", {
    accountId: brokerage.id,
    ticker: "VXUS",
    name: "Vanguard Total International Stock ETF",
    assetClass: "intl_equity",
    targetAllocationBps: pct(10),
  });

  const lots: Array<{
    holdingId: string;
    tradeDate: string;
    shares: number;
    /** Fraction of today's quote paid per share — <1 is a gain, >1 a loss. */
    costFactor: number;
  }> = [
    // VOO: an older, larger buy well below today's price (a solid gain)...
    { holdingId: vooHolding.id, tradeDate: addMonthsIso(today, -14), shares: 25, costFactor: 0.78 },
    // ...topped up recently just above today's price — a small paper loss,
    // so lotsAtALoss has something to show.
    { holdingId: vooHolding.id, tradeDate: addMonthsIso(today, -2), shares: 5, costFactor: 1.03 },
    { holdingId: bndHolding.id, tradeDate: addMonthsIso(today, -8), shares: 100, costFactor: 0.96 },
    { holdingId: vxusHolding.id, tradeDate: addMonthsIso(today, -5), shares: 40, costFactor: 0.9 },
  ];
  const priceByHoldingId: Record<string, number> = {
    [vooHolding.id]: vooPriceCents,
    [bndHolding.id]: bndPriceCents,
    [vxusHolding.id]: vxusPriceCents,
  };
  for (const lot of lots) {
    const costPerShareCents = Math.round(priceByHoldingId[lot.holdingId] * lot.costFactor);
    await createEntity<Lot>("lot", {
      holdingId: lot.holdingId,
      tradeDate: lot.tradeDate,
      sharesMicro: sharesToMicros(lot.shares),
      costTotalCents: costPerShareCents * lot.shares,
      feesCents: 0,
      status: "open",
      closeDate: null,
      proceedsCents: 0,
      note: "",
    });
  }

  for (const [ticker, priceCents] of [
    ["VOO", vooPriceCents],
    ["BND", bndPriceCents],
    ["VXUS", vxusPriceCents],
  ] as const) {
    await createEntity<PriceQuote>("price_quote", {
      ticker,
      quoteDate: today,
      priceCents,
      source: "googlefinance",
    });
  }

  // currentBalanceCents is only a fallback for accounts with no holdings —
  // accountValueCents (portfolio engine) already prefers summed positions
  // once an account has any. But the Investments list and the account's own
  // row still read this typed field directly, so leaving it at its original
  // placeholder value would make the demo visibly disagree with itself (the
  // Portfolio screen would total the positions to a different number).
  // Recompute it from the exact lots and prices just seeded, reusing the
  // same priceByHoldingId map used for the quote rows, so the two can never
  // drift apart.
  const brokerageValueCents = lots.reduce(
    (sum, lot) =>
      sum +
      sharesValueCents(sharesToMicros(lot.shares), priceByHoldingId[lot.holdingId]),
    0,
  );
  const { entity: updatedBrokerage } = await updateEntity<InvestmentAccount>(
    "investment_account",
    { id: brokerage.id, currentBalanceCents: brokerageValueCents },
  );
  const brokerageIndex = accountEntities.findIndex((a) => a.id === brokerage.id);
  if (brokerageIndex !== -1) accountEntities[brokerageIndex] = updatedBrokerage;

  // Observations: datestamped value marks for the net-worth history chart and
  // the freshness banner. Dated off the clock (not hardcoded) so the demo
  // doesn't visibly "age" the moment the calendar turns — the freshness
  // thresholds (45/180 days) would otherwise mark everything stale over time.

  /**
   * EVERY tracked subject gets the same six monthly marks, ending today at its
   * current value. Giving only one subject a history and the rest a single
   * mark dated today produces a flat line that jumps vertically in the final
   * month — the chart then reads as "net worth 10x'd overnight" when all it
   * really shows is coverage arriving late.
   *
   * Each series walks back from today's value by a per-month factor. Assets
   * ramp up; a loan balance ramps DOWN toward today as it amortises.
   */
  const MONTHS = 6;
  const ASSET_PATH = [0.915, 0.936, 0.929, 0.962, 0.981, 1]; // oldest → today
  const LOAN_PATH = [1.045, 1.036, 1.027, 1.018, 1.009, 1]; // balance shrinks

  const series: Array<{
    subjectType: Observation["subjectType"];
    subjectId: string;
    currentCents: number;
    path: number[];
  }> = [
    ...accountEntities.map((a) => ({
      subjectType: "investment_account" as const,
      subjectId: a.id,
      currentCents: a.currentBalanceCents,
      path: ASSET_PATH,
    })),
    {
      subjectType: "property" as const,
      subjectId: townhouse.id,
      currentCents: townhouse.currentValueCents,
      path: ASSET_PATH,
    },
    {
      subjectType: "property" as const,
      subjectId: lakeside.id,
      currentCents: lakeside.currentValueCents,
      path: ASSET_PATH,
    },
    {
      subjectType: "loan" as const,
      subjectId: townhouseLoan.id,
      currentCents: townhouseLoan.currentBalanceCents,
      path: LOAN_PATH,
    },
  ];

  for (const s of series) {
    for (let i = 0; i < MONTHS; i++) {
      await createEntity<Observation>("observation", {
        householdId: household.id,
        subjectType: s.subjectType,
        subjectId: s.subjectId,
        observedAt: addMonthsIso(today, -(MONTHS - 1 - i)),
        valueCents: Math.round(s.currentCents * s.path[i]),
        source: "manual",
        note: "",
      });
    }
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
