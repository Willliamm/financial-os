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
  | ProjectionSnapshot;
