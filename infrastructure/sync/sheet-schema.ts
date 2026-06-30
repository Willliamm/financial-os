import type { EntityType } from "@/domain/entities/base";

export type ColumnType = "string" | "number" | "boolean";

export interface ColumnDef {
  header: string;
  field: string;
  type: ColumnType;
}

function col(header: string, field: string, type: ColumnType): ColumnDef {
  return { header, field, type };
}

const LEADING: ColumnDef[] = [
  col("id", "id", "string"),
  col("version", "version", "number"),
];

const TRAILING: ColumnDef[] = [
  col("created_at", "createdAt", "string"),
  col("updated_at", "updatedAt", "string"),
  col("deleted_at", "deletedAt", "string"),
  col("created_by", "createdBy", "string"),
  col("updated_by", "updatedBy", "string"),
];

function entityColumns(business: ColumnDef[]): ColumnDef[] {
  return [...LEADING, ...business, ...TRAILING];
}

/** Ordered column definitions for every domain entity sheet. */
export const SHEET_COLUMNS: Record<EntityType, ColumnDef[]> = {
  household: entityColumns([
    col("name", "name", "string"),
    col("base_currency", "baseCurrency", "string"),
    col("country", "country", "string"),
    col("state", "state", "string"),
    col("city", "city", "string"),
    col("filing_status", "filingStatus", "string"),
  ]),
  person: entityColumns([
    col("household_id", "householdId", "string"),
    col("name", "name", "string"),
    col("email", "email", "string"),
    col("role", "role", "string"),
    col("birth_year", "birthYear", "number"),
  ]),
  income_source: entityColumns([
    col("household_id", "householdId", "string"),
    col("person_id", "personId", "string"),
    col("name", "name", "string"),
    col("type", "type", "string"),
    col("annual_amount_cents", "annualAmountCents", "number"),
    col("growth_rate_bps", "growthRateBps", "number"),
    col("start_date", "startDate", "string"),
    col("end_date", "endDate", "string"),
    col("tax_treatment", "taxTreatment", "string"),
    col("active", "active", "boolean"),
  ]),
  expense: entityColumns([
    col("household_id", "householdId", "string"),
    col("name", "name", "string"),
    col("category", "category", "string"),
    col("monthly_amount_cents", "monthlyAmountCents", "number"),
    col("inflation_rate_bps", "inflationRateBps", "number"),
    col("start_date", "startDate", "string"),
    col("end_date", "endDate", "string"),
    col("is_discretionary", "isDiscretionary", "boolean"),
  ]),
  property: entityColumns([
    col("household_id", "householdId", "string"),
    col("name", "name", "string"),
    col("property_type", "propertyType", "string"),
    col("ownership_type", "ownershipType", "string"),
    col("street", "street", "string"),
    col("city", "city", "string"),
    col("state", "state", "string"),
    col("zip", "zip", "string"),
    col("purchase_date", "purchaseDate", "string"),
    col("purchase_price_cents", "purchasePriceCents", "number"),
    col("current_value_cents", "currentValueCents", "number"),
    col("down_payment_cents", "downPaymentCents", "number"),
    col("closing_costs_cents", "closingCostsCents", "number"),
    col("bedrooms", "bedrooms", "number"),
    col("bathrooms", "bathrooms", "number"),
    col("sqft", "sqft", "number"),
    col("year_built", "yearBuilt", "number"),
    col("hoa_monthly_cents", "hoaMonthlyCents", "number"),
    col("cdd_annual_cents", "cddAnnualCents", "number"),
    col("property_tax_annual_cents", "propertyTaxAnnualCents", "number"),
    col("insurance_annual_cents", "insuranceAnnualCents", "number"),
    col("maintenance_annual_cents", "maintenanceAnnualCents", "number"),
    col("appreciation_rate_bps", "appreciationRateBps", "number"),
    col("rent_monthly_cents", "rentMonthlyCents", "number"),
    col("vacancy_rate_bps", "vacancyRateBps", "number"),
    col("management_fee_bps", "managementFeeBps", "number"),
    col("status", "status", "string"),
    col("notes", "notes", "string"),
  ]),
  loan: entityColumns([
    col("property_id", "propertyId", "string"),
    col("lender", "lender", "string"),
    col("loan_type", "loanType", "string"),
    col("original_balance_cents", "originalBalanceCents", "number"),
    col("current_balance_cents", "currentBalanceCents", "number"),
    col("interest_rate_bps", "interestRateBps", "number"),
    col("term_months", "termMonths", "number"),
    col("start_date", "startDate", "string"),
    col("monthly_payment_cents", "monthlyPaymentCents", "number"),
    col("escrow_monthly_cents", "escrowMonthlyCents", "number"),
    col("extra_payment_monthly_cents", "extraPaymentMonthlyCents", "number"),
  ]),
  investment_account: entityColumns([
    col("household_id", "householdId", "string"),
    col("name", "name", "string"),
    col("account_type", "accountType", "string"),
    col("institution", "institution", "string"),
    col("current_balance_cents", "currentBalanceCents", "number"),
    col("expected_return_bps", "expectedReturnBps", "number"),
    col("contribution_monthly_cents", "contributionMonthlyCents", "number"),
    col("tax_treatment", "taxTreatment", "string"),
  ]),
  tax_strategy: entityColumns([
    col("household_id", "householdId", "string"),
    col("year", "year", "number"),
    col("name", "name", "string"),
    col("strategy_type", "strategyType", "string"),
    col("estimated_deduction_cents", "estimatedDeductionCents", "number"),
    col("estimated_tax_savings_cents", "estimatedTaxSavingsCents", "number"),
    col("status", "status", "string"),
    col("risk_level", "riskLevel", "string"),
    col("notes", "notes", "string"),
  ]),
  tax_assumption: entityColumns([
    col("household_id", "householdId", "string"),
    col("year", "year", "number"),
    col("filing_status", "filingStatus", "string"),
    col("federal_effective_rate_bps", "federalEffectiveRateBps", "number"),
    col("state_effective_rate_bps", "stateEffectiveRateBps", "number"),
    col("self_employment_tax_rate_bps", "selfEmploymentTaxRateBps", "number"),
    col("fica_rate_bps", "ficaRateBps", "number"),
    col("standard_deduction_cents", "standardDeductionCents", "number"),
    col("itemized_deduction_cents", "itemizedDeductionCents", "number"),
  ]),
  scenario: entityColumns([
    col("household_id", "householdId", "string"),
    col("name", "name", "string"),
    col("description", "description", "string"),
    col("start_year", "startYear", "number"),
    col("end_year", "endYear", "number"),
    col("base_scenario_id", "baseScenarioId", "string"),
    col("status", "status", "string"),
  ]),
  scenario_assumption: entityColumns([
    col("scenario_id", "scenarioId", "string"),
    col("key", "key", "string"),
    col("value", "value", "string"),
    col("value_type", "valueType", "string"),
  ]),
  projection_snapshot: entityColumns([
    col("scenario_id", "scenarioId", "string"),
    col("year", "year", "number"),
    col("net_worth_cents", "netWorthCents", "number"),
    col("total_assets_cents", "totalAssetsCents", "number"),
    col("total_liabilities_cents", "totalLiabilitiesCents", "number"),
    col("active_income_cents", "activeIncomeCents", "number"),
    col("passive_income_cents", "passiveIncomeCents", "number"),
    col("estimated_tax_cents", "estimatedTaxCents", "number"),
    col("investable_cashflow_cents", "investableCashflowCents", "number"),
  ]),
};

export function headersFor(type: EntityType): string[] {
  return SHEET_COLUMNS[type].map((c) => c.header);
}

/** Technical tabs that exist alongside the domain sheets. */
export const TECHNICAL_SHEETS: Record<string, string[]> = {
  __meta: ["key", "value", "updated_at"],
  __locks: [
    "resource_key",
    "resource_type",
    "resource_id",
    "lock_token",
    "owner_user_id",
    "owner_email",
    "owner_name",
    "owner_session_id",
    "acquired_at",
    "heartbeat_at",
    "expires_at",
    "status",
  ],
  __sync_log: [
    "id",
    "command_id",
    "entity_type",
    "entity_id",
    "operation",
    "payload_hash",
    "user_email",
    "client_created_at",
    "synced_at",
    "status",
  ],
  __schema_migrations: ["id", "version", "applied_at", "applied_by"],
};
