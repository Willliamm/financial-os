import type { BaseEntity } from "./base";

export * from "./base";

export interface Household extends BaseEntity {
  name: string;
  baseCurrency: string;
  country: string;
  state: string;
  city: string;
  filingStatus: FilingStatus;
}

export type FilingStatus =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household";

export interface Person extends BaseEntity {
  householdId: string;
  name: string;
  email: string;
  role: string;
  birthYear: number;
}

export type IncomeType =
  | "w2"
  | "llc"
  | "rental"
  | "dividend"
  | "interest"
  | "bonus"
  | "other";

export type TaxTreatment =
  | "ordinary"
  | "qualified_dividend"
  | "capital_gain"
  | "tax_free";

export interface IncomeSource extends BaseEntity {
  householdId: string;
  personId: string | null;
  name: string;
  type: IncomeType;
  annualAmountCents: number;
  growthRateBps: number;
  startDate: string | null;
  endDate: string | null;
  taxTreatment: TaxTreatment;
  active: boolean;
}

export type ExpenseCategory =
  | "housing"
  | "utilities"
  | "food"
  | "transportation"
  | "insurance"
  | "healthcare"
  | "debt"
  | "discretionary"
  | "business"
  | "taxes"
  | "property"
  | "other";

export interface Expense extends BaseEntity {
  householdId: string;
  name: string;
  category: ExpenseCategory;
  monthlyAmountCents: number;
  inflationRateBps: number;
  startDate: string | null;
  endDate: string | null;
  isDiscretionary: boolean;
}

export type PropertyType = "townhouse" | "sfh" | "condo" | "multifamily";
export type OwnershipType = "personal" | "llc";
export type PropertyStatus = "prospect" | "owned" | "sold";

export interface Property extends BaseEntity {
  householdId: string;
  name: string;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  street: string;
  city: string;
  state: string;
  zip: string;
  purchaseDate: string | null;
  purchasePriceCents: number;
  currentValueCents: number;
  downPaymentCents: number;
  closingCostsCents: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;
  hoaMonthlyCents: number;
  cddAnnualCents: number;
  propertyTaxAnnualCents: number;
  insuranceAnnualCents: number;
  maintenanceAnnualCents: number;
  appreciationRateBps: number;
  rentMonthlyCents: number;
  vacancyRateBps: number;
  managementFeeBps: number;
  status: PropertyStatus;
  notes: string;
}

export type LoanType =
  | "conventional"
  | "fha"
  | "va"
  | "heloc"
  | "private"
  | "other";

export interface Loan extends BaseEntity {
  propertyId: string | null;
  lender: string;
  loanType: LoanType;
  originalBalanceCents: number;
  currentBalanceCents: number;
  interestRateBps: number;
  termMonths: number;
  startDate: string | null;
  monthlyPaymentCents: number;
  escrowMonthlyCents: number;
  extraPaymentMonthlyCents: number;
}

export type AccountType =
  | "brokerage"
  | "401k"
  | "solo_401k"
  | "ira"
  | "roth_ira"
  | "hsa"
  | "cash_balance_plan"
  | "cash"
  | "crypto"
  | "other";

export interface InvestmentAccount extends BaseEntity {
  householdId: string;
  name: string;
  accountType: AccountType;
  institution: string;
  currentBalanceCents: number;
  expectedReturnBps: number;
  contributionMonthlyCents: number;
  taxTreatment: "taxable" | "tax_deferred" | "tax_free";
}

export type StrategyStatus = "idea" | "planned" | "active" | "completed";
export type RiskLevel = "low" | "medium" | "high";

export interface TaxStrategy extends BaseEntity {
  householdId: string;
  year: number;
  name: string;
  strategyType: string;
  estimatedDeductionCents: number;
  estimatedTaxSavingsCents: number;
  status: StrategyStatus;
  riskLevel: RiskLevel;
  notes: string;
}

export interface TaxAssumption extends BaseEntity {
  householdId: string;
  year: number;
  filingStatus: FilingStatus;
  federalEffectiveRateBps: number;
  stateEffectiveRateBps: number;
  selfEmploymentTaxRateBps: number;
  ficaRateBps: number;
  standardDeductionCents: number;
  itemizedDeductionCents: number;
}

export type ScenarioStatus = "draft" | "active" | "archived";

export interface Scenario extends BaseEntity {
  householdId: string;
  name: string;
  description: string;
  startYear: number;
  endYear: number;
  baseScenarioId: string | null;
  status: ScenarioStatus;
}

export interface ScenarioAssumption extends BaseEntity {
  scenarioId: string;
  key: string;
  value: string;
  valueType: "string" | "number" | "boolean" | "bps" | "cents";
}

export interface ProjectionSnapshot extends BaseEntity {
  scenarioId: string;
  year: number;
  netWorthCents: number;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  activeIncomeCents: number;
  passiveIncomeCents: number;
  estimatedTaxCents: number;
  investableCashflowCents: number;
}

/** What an observation can be a mark of. */
export type ObservationSubjectType =
  | "investment_account"
  | "property"
  | "loan";

export type ObservationSource = "manual" | "quote" | "import";

/**
 * A datestamped value mark for an asset or liability. Observations are additive
 * history: they never replace an entity's current-value field, they record what
 * that value was on a given calendar day.
 */
export interface Observation extends BaseEntity {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Calendar day of the mark, "YYYY-MM-DD". Not a timestamp. */
  observedAt: string;
  /**
   * The value as reported, normally positive. A loan balance is stored positive;
   * the history engine subtracts it. Negative is allowed so a margin account can
   * be marked honestly.
   */
  valueCents: number;
  source: ObservationSource;
  note: string;
}

/**
 * Whether a subject reduces net worth. Lives in the domain (not in features/)
 * because the pure history engine needs it and domain must not import features.
 */
export const OBSERVATION_SUBJECT_IS_LIABILITY: Record<
  ObservationSubjectType,
  boolean
> = {
  investment_account: false,
  property: false,
  loan: true,
};

export type AssetClass =
  | "us_equity"
  | "intl_equity"
  | "bond"
  | "reit"
  | "cash"
  | "crypto"
  | "other";

/** A position: one instrument held inside one investment account. */
export interface Holding extends BaseEntity {
  accountId: string;
  /** Uppercase symbol, e.g. "VOO". Empty for an unquoted holding. */
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Target weight in the portfolio, in bps. 0 means "no target set". */
  targetAllocationBps: number;
}

export type LotStatus = "open" | "closed";

/**
 * One purchase. Cost is stored as the TOTAL paid, never a per-share price:
 * $512.4013 x 12 shares cannot round-trip through an integer per-share cent
 * value, and the total is what the brokerage statement and the IRS both use.
 */
export interface Lot extends BaseEntity {
  holdingId: string;
  /** Trade date, "YYYY-MM-DD". */
  tradeDate: string;
  /** Integer millionths of a share. 1 share = 1_000_000. */
  sharesMicro: number;
  /** Total paid for the shares, excluding fees. */
  costTotalCents: number;
  feesCents: number;
  status: LotStatus;
  closeDate: string | null;
  /** Gross proceeds when closed; 0 while open. */
  proceedsCents: number;
  note: string;
}

export type QuoteSource = "googlefinance" | "manual";

export interface PriceQuote extends BaseEntity {
  ticker: string;
  /** "YYYY-MM-DD". At most one quote per ticker per day. */
  quoteDate: string;
  /**
   * Price per share in integer cents, rounded. Max error is half a cent per
   * share — about 0.001% on a 10,000-share position, against a feed that is
   * itself ~20 minutes delayed. Sub-cent precision here would be false.
   */
  priceCents: number;
  source: QuoteSource;
}

/** Discriminated union of all entities, keyed by entity type, for generic code. */
export type AnyEntity =
  | Household
  | Person
  | IncomeSource
  | Expense
  | Property
  | Loan
  | InvestmentAccount
  | TaxStrategy
  | TaxAssumption
  | Scenario
  | ScenarioAssumption
  | ProjectionSnapshot
  | Observation
  | Holding
  | Lot
  | PriceQuote;
