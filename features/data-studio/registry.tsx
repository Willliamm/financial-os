import {
  Banknote,
  Building2,
  CreditCard,
  Landmark,
  PiggyBank,
  Receipt,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import type {
  Expense,
  IncomeSource,
  InvestmentAccount,
  Loan,
  Property,
  Scenario,
  TaxStrategy,
} from "@/domain/entities";
import type { EntityType } from "@/domain/entities/base";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { formatDate } from "@/infrastructure/dates/date-utils";
import { Badge } from "@/components/ui/badge";
import i18n from "@/lib/i18n/config";
import type { EntityConfig, SelectOption } from "./types";

/**
 * Build select options whose `label` is an i18n KEY (not display text). The
 * registry is plain data — not a React component — so it stores keys and the
 * render sites call `t(...)`. For values rendered inside the registry's own
 * render/secondary functions, `labelOf` resolves the key through the global
 * i18n instance.
 */
function enumOpts(group: string, values: string[]): SelectOption[] {
  return values.map((value) => ({ value, label: `entities:${group}.${value}` }));
}

const INCOME_TYPES = enumOpts("incomeType", [
  "w2",
  "llc",
  "rental",
  "dividend",
  "interest",
  "bonus",
  "other",
]);

const TAX_TREATMENTS = enumOpts("taxTreatment", [
  "ordinary",
  "qualified_dividend",
  "capital_gain",
  "tax_free",
]);

const EXPENSE_CATEGORIES = enumOpts("expenseCategory", [
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

const PROPERTY_TYPES = enumOpts("propertyType", [
  "townhouse",
  "sfh",
  "condo",
  "multifamily",
]);

const OWNERSHIP_TYPES = enumOpts("ownershipType", ["personal", "llc"]);
const PROPERTY_STATUS = enumOpts("propertyStatus", ["prospect", "owned", "sold"]);

const LOAN_TYPES = enumOpts("loanType", [
  "conventional",
  "fha",
  "va",
  "heloc",
  "private",
  "other",
]);

const ACCOUNT_TYPES = enumOpts("accountType", [
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

const ACCOUNT_TAX = enumOpts("accountTax", ["taxable", "tax_deferred", "tax_free"]);

const STRATEGY_STATUS = enumOpts("strategyStatus", [
  "idea",
  "planned",
  "active",
  "completed",
]);
const RISK_LEVELS = enumOpts("riskLevel", ["low", "medium", "high"]);
const SCENARIO_STATUS = enumOpts("scenarioStatus", ["draft", "active", "archived"]);

/** Resolve a value to its translated enum label (label holds an i18n key). */
function labelOf(options: SelectOption[], value: string): string {
  const key = options.find((o) => o.value === value)?.label;
  return key ? i18n.t(key) : value;
}

function def<T>(config: EntityConfig<T>): EntityConfig<T> {
  return config;
}

const income = def<IncomeSource>({
  type: "income_source",
  singular: "entities:incomeSource.singular",
  plural: "entities:incomeSource.plural",
  icon: Banknote,
  href: "/income",
  description: "dataStudio:modules.incomeSource.description",
  inject: (ctx) => ({ householdId: ctx.householdId }),
  fields: [
    { name: "name", label: "forms:incomeSource.name.label", type: "text", required: true, colSpan: 2 },
    { name: "type", label: "forms:incomeSource.type.label", type: "select", options: INCOME_TYPES },
    {
      name: "personId",
      label: "forms:incomeSource.personId.label",
      type: "select",
      dynamicOptions: "people",
    },
    {
      name: "annualAmountCents",
      label: "forms:incomeSource.annualAmountCents.label",
      type: "money",
      required: true,
    },
    { name: "growthRateBps", label: "forms:incomeSource.growthRateBps.label", type: "percent" },
    {
      name: "taxTreatment",
      label: "forms:incomeSource.taxTreatment.label",
      type: "select",
      options: TAX_TREATMENTS,
    },
    { name: "active", label: "forms:incomeSource.active.label", type: "switch", defaultValue: true },
  ],
  columns: [
    {
      label: "forms:columns.type",
      render: (e) => <Badge variant="secondary">{labelOf(INCOME_TYPES, e.type)}</Badge>,
    },
    {
      label: "forms:columns.annual",
      align: "right",
      render: (e) => formatCents(e.annualAmountCents),
    },
    {
      label: "forms:columns.growth",
      align: "right",
      render: (e) => formatBps(e.growthRateBps),
    },
  ],
  primary: (e) => e.name,
  secondary: (e) =>
    `${labelOf(INCOME_TYPES, e.type)} · ${formatCents(e.annualAmountCents)}/yr`,
  searchText: (e) => `${e.name} ${e.type}`,
});

const expense = def<Expense>({
  type: "expense",
  singular: "entities:expense.singular",
  plural: "entities:expense.plural",
  icon: Receipt,
  href: "/expenses",
  description: "dataStudio:modules.expense.description",
  inject: (ctx) => ({ householdId: ctx.householdId }),
  fields: [
    { name: "name", label: "forms:expense.name.label", type: "text", required: true, colSpan: 2 },
    {
      name: "category",
      label: "forms:expense.category.label",
      type: "select",
      options: EXPENSE_CATEGORIES,
    },
    {
      name: "monthlyAmountCents",
      label: "forms:expense.monthlyAmountCents.label",
      type: "money",
      required: true,
    },
    { name: "inflationRateBps", label: "forms:expense.inflationRateBps.label", type: "percent" },
    { name: "isDiscretionary", label: "forms:expense.isDiscretionary.label", type: "switch" },
  ],
  columns: [
    {
      label: "forms:columns.category",
      render: (e) => (
        <Badge variant="secondary">{labelOf(EXPENSE_CATEGORIES, e.category)}</Badge>
      ),
    },
    {
      label: "forms:columns.monthly",
      align: "right",
      render: (e) => formatCents(e.monthlyAmountCents),
    },
    {
      label: "forms:columns.annual",
      align: "right",
      render: (e) => formatCents(e.monthlyAmountCents * 12),
    },
  ],
  primary: (e) => e.name,
  secondary: (e) =>
    `${labelOf(EXPENSE_CATEGORIES, e.category)} · ${formatCents(e.monthlyAmountCents)}/mo`,
  searchText: (e) => `${e.name} ${e.category}`,
});

const property = def<Property>({
  type: "property",
  singular: "entities:property.singular",
  plural: "entities:property.plural",
  icon: Building2,
  href: "/properties",
  description: "dataStudio:modules.property.description",
  inject: (ctx) => ({ householdId: ctx.householdId }),
  sections: [
    "forms:sections.general",
    "forms:sections.acquisition",
    "forms:sections.rental",
    "forms:sections.costs",
    "forms:sections.notes",
  ],
  fields: [
    { name: "name", label: "forms:property.name.label", type: "text", required: true, colSpan: 2, section: "forms:sections.general" },
    { name: "propertyType", label: "forms:property.propertyType.label", type: "select", options: PROPERTY_TYPES, section: "forms:sections.general" },
    { name: "ownershipType", label: "forms:property.ownershipType.label", type: "select", options: OWNERSHIP_TYPES, section: "forms:sections.general" },
    { name: "status", label: "forms:property.status.label", type: "select", options: PROPERTY_STATUS, section: "forms:sections.general" },
    { name: "street", label: "forms:property.street.label", type: "text", colSpan: 2, section: "forms:sections.general" },
    { name: "city", label: "forms:property.city.label", type: "text", section: "forms:sections.general" },
    { name: "state", label: "forms:property.state.label", type: "text", section: "forms:sections.general" },
    { name: "zip", label: "forms:property.zip.label", type: "text", section: "forms:sections.general" },
    { name: "purchaseDate", label: "forms:property.purchaseDate.label", type: "date", section: "forms:sections.acquisition" },
    { name: "purchasePriceCents", label: "forms:property.purchasePriceCents.label", type: "money", section: "forms:sections.acquisition" },
    { name: "currentValueCents", label: "forms:property.currentValueCents.label", type: "money", required: true, section: "forms:sections.acquisition" },
    { name: "downPaymentCents", label: "forms:property.downPaymentCents.label", type: "money", section: "forms:sections.acquisition" },
    { name: "closingCostsCents", label: "forms:property.closingCostsCents.label", type: "money", section: "forms:sections.acquisition" },
    { name: "appreciationRateBps", label: "forms:property.appreciationRateBps.label", type: "percent", defaultValue: 300, section: "forms:sections.acquisition" },
    { name: "bedrooms", label: "forms:property.bedrooms.label", type: "number", section: "forms:sections.acquisition" },
    { name: "bathrooms", label: "forms:property.bathrooms.label", type: "number", section: "forms:sections.acquisition" },
    { name: "sqft", label: "forms:property.sqft.label", type: "number", section: "forms:sections.acquisition" },
    { name: "yearBuilt", label: "forms:property.yearBuilt.label", type: "number", section: "forms:sections.acquisition" },
    { name: "rentMonthlyCents", label: "forms:property.rentMonthlyCents.label", type: "money", section: "forms:sections.rental" },
    { name: "vacancyRateBps", label: "forms:property.vacancyRateBps.label", type: "percent", defaultValue: 500, section: "forms:sections.rental" },
    { name: "managementFeeBps", label: "forms:property.managementFeeBps.label", type: "percent", section: "forms:sections.rental" },
    { name: "hoaMonthlyCents", label: "forms:property.hoaMonthlyCents.label", type: "money", section: "forms:sections.costs" },
    { name: "cddAnnualCents", label: "forms:property.cddAnnualCents.label", type: "money", section: "forms:sections.costs" },
    { name: "propertyTaxAnnualCents", label: "forms:property.propertyTaxAnnualCents.label", type: "money", section: "forms:sections.costs" },
    { name: "insuranceAnnualCents", label: "forms:property.insuranceAnnualCents.label", type: "money", section: "forms:sections.costs" },
    { name: "maintenanceAnnualCents", label: "forms:property.maintenanceAnnualCents.label", type: "money", section: "forms:sections.costs" },
    { name: "notes", label: "forms:property.notes.label", type: "textarea", colSpan: 2, section: "forms:sections.notes" },
  ],
  columns: [
    {
      label: "forms:columns.status",
      render: (e) => <Badge variant="secondary">{labelOf(PROPERTY_STATUS, e.status)}</Badge>,
    },
    { label: "forms:columns.value", align: "right", render: (e) => formatCents(e.currentValueCents) },
    { label: "forms:columns.rent", align: "right", render: (e) => formatCents(e.rentMonthlyCents) },
  ],
  primary: (e) => e.name,
  secondary: (e) =>
    `${[e.city, e.state].filter(Boolean).join(", ") || labelOf(PROPERTY_TYPES, e.propertyType)} · ${formatCents(e.currentValueCents)}`,
  searchText: (e) => `${e.name} ${e.city} ${e.state} ${e.propertyType}`,
});

const loan = def<Loan>({
  type: "loan",
  singular: "entities:loan.singular",
  plural: "entities:loan.plural",
  icon: CreditCard,
  href: "/loans",
  description: "dataStudio:modules.loan.description",
  fields: [
    { name: "lender", label: "forms:loan.lender.label", type: "text", required: true, colSpan: 2 },
    { name: "loanType", label: "forms:loan.loanType.label", type: "select", options: LOAN_TYPES },
    { name: "propertyId", label: "forms:loan.propertyId.label", type: "select", dynamicOptions: "properties" },
    { name: "originalBalanceCents", label: "forms:loan.originalBalanceCents.label", type: "money" },
    { name: "currentBalanceCents", label: "forms:loan.currentBalanceCents.label", type: "money", required: true },
    { name: "interestRateBps", label: "forms:loan.interestRateBps.label", type: "percent", required: true },
    { name: "termMonths", label: "forms:loan.termMonths.label", type: "number", defaultValue: 360 },
    { name: "startDate", label: "forms:loan.startDate.label", type: "date" },
    { name: "monthlyPaymentCents", label: "forms:loan.monthlyPaymentCents.label", type: "money" },
    { name: "escrowMonthlyCents", label: "forms:loan.escrowMonthlyCents.label", type: "money" },
    { name: "extraPaymentMonthlyCents", label: "forms:loan.extraPaymentMonthlyCents.label", type: "money" },
  ],
  columns: [
    { label: "forms:columns.type", render: (e) => <Badge variant="secondary">{labelOf(LOAN_TYPES, e.loanType)}</Badge> },
    { label: "forms:columns.balance", align: "right", render: (e) => formatCents(e.currentBalanceCents) },
    { label: "forms:columns.rate", align: "right", render: (e) => formatBps(e.interestRateBps) },
  ],
  primary: (e) => e.lender || i18n.t("entities:loan.singular"),
  secondary: (e) => `${formatCents(e.currentBalanceCents)} @ ${formatBps(e.interestRateBps)}`,
  searchText: (e) => `${e.lender} ${e.loanType}`,
});

const investment = def<InvestmentAccount>({
  type: "investment_account",
  singular: "entities:investmentAccount.singular",
  plural: "entities:investmentAccount.plural",
  icon: TrendingUp,
  href: "/investments",
  description: "dataStudio:modules.investmentAccount.description",
  inject: (ctx) => ({ householdId: ctx.householdId }),
  fields: [
    { name: "name", label: "forms:investmentAccount.name.label", type: "text", required: true, colSpan: 2 },
    { name: "accountType", label: "forms:investmentAccount.accountType.label", type: "select", options: ACCOUNT_TYPES },
    { name: "institution", label: "forms:investmentAccount.institution.label", type: "text" },
    { name: "currentBalanceCents", label: "forms:investmentAccount.currentBalanceCents.label", type: "money", required: true },
    { name: "expectedReturnBps", label: "forms:investmentAccount.expectedReturnBps.label", type: "percent", defaultValue: 700 },
    { name: "contributionMonthlyCents", label: "forms:investmentAccount.contributionMonthlyCents.label", type: "money" },
    { name: "taxTreatment", label: "forms:investmentAccount.taxTreatment.label", type: "select", options: ACCOUNT_TAX },
  ],
  columns: [
    { label: "forms:columns.type", render: (e) => <Badge variant="secondary">{labelOf(ACCOUNT_TYPES, e.accountType)}</Badge> },
    { label: "forms:columns.balance", align: "right", render: (e) => formatCents(e.currentBalanceCents) },
    { label: "forms:columns.return", align: "right", render: (e) => formatBps(e.expectedReturnBps) },
  ],
  primary: (e) => e.name,
  secondary: (e) => `${labelOf(ACCOUNT_TYPES, e.accountType)} · ${formatCents(e.currentBalanceCents)}`,
  searchText: (e) => `${e.name} ${e.accountType} ${e.institution}`,
});

const taxStrategy = def<TaxStrategy>({
  type: "tax_strategy",
  singular: "entities:taxStrategy.singular",
  plural: "entities:taxStrategy.plural",
  icon: ReceiptText,
  href: "/tax-planning",
  description: "dataStudio:modules.taxStrategy.description",
  inject: (ctx) => ({ householdId: ctx.householdId, year: new Date().getFullYear() }),
  fields: [
    { name: "name", label: "forms:taxStrategy.name.label", type: "text", required: true, colSpan: 2 },
    { name: "strategyType", label: "forms:taxStrategy.strategyType.label", type: "text" },
    { name: "year", label: "forms:taxStrategy.year.label", type: "number", defaultValue: new Date().getFullYear() },
    { name: "estimatedDeductionCents", label: "forms:taxStrategy.estimatedDeductionCents.label", type: "money" },
    { name: "estimatedTaxSavingsCents", label: "forms:taxStrategy.estimatedTaxSavingsCents.label", type: "money" },
    { name: "status", label: "forms:taxStrategy.status.label", type: "select", options: STRATEGY_STATUS },
    { name: "riskLevel", label: "forms:taxStrategy.riskLevel.label", type: "select", options: RISK_LEVELS },
    { name: "notes", label: "forms:taxStrategy.notes.label", type: "textarea", colSpan: 2 },
  ],
  columns: [
    { label: "forms:columns.status", render: (e) => <Badge variant="secondary">{labelOf(STRATEGY_STATUS, e.status)}</Badge> },
    { label: "forms:columns.savings", align: "right", render: (e) => formatCents(e.estimatedTaxSavingsCents) },
    { label: "forms:columns.risk", align: "right", render: (e) => labelOf(RISK_LEVELS, e.riskLevel) },
  ],
  primary: (e) => e.name,
  secondary: (e) => `${formatCents(e.estimatedTaxSavingsCents)} est. savings`,
  searchText: (e) => `${e.name} ${e.strategyType}`,
});

const scenario = def<Scenario>({
  type: "scenario",
  singular: "entities:scenario.singular",
  plural: "entities:scenario.plural",
  icon: Landmark,
  href: "/scenarios",
  description: "dataStudio:modules.scenario.description",
  inject: (ctx) => ({ householdId: ctx.householdId, baseScenarioId: null }),
  fields: [
    { name: "name", label: "forms:scenario.name.label", type: "text", required: true, colSpan: 2 },
    { name: "description", label: "forms:scenario.description.label", type: "textarea", colSpan: 2 },
    { name: "startYear", label: "forms:scenario.startYear.label", type: "number", defaultValue: new Date().getFullYear() },
    { name: "endYear", label: "forms:scenario.endYear.label", type: "number", defaultValue: new Date().getFullYear() + 20 },
    { name: "status", label: "forms:scenario.status.label", type: "select", options: SCENARIO_STATUS },
  ],
  columns: [
    { label: "forms:columns.status", render: (e) => <Badge variant="secondary">{labelOf(SCENARIO_STATUS, e.status)}</Badge> },
    { label: "forms:columns.horizon", align: "right", render: (e) => `${e.startYear}–${e.endYear}` },
  ],
  primary: (e) => e.name,
  secondary: (e) => e.description || `${e.startYear}–${e.endYear}`,
  searchText: (e) => `${e.name} ${e.description}`,
});

export const ENTITY_REGISTRY: Record<string, EntityConfig<never>> = {
  income_source: income as EntityConfig<never>,
  expense: expense as EntityConfig<never>,
  property: property as EntityConfig<never>,
  loan: loan as EntityConfig<never>,
  investment_account: investment as EntityConfig<never>,
  tax_strategy: taxStrategy as EntityConfig<never>,
  scenario: scenario as EntityConfig<never>,
};

/** Entity types managed through the generic Data Studio CRUD UI. */
export const DATA_STUDIO_MODULES: EntityType[] = [
  "income_source",
  "expense",
  "property",
  "loan",
  "investment_account",
  "tax_strategy",
  "scenario",
];

export function getEntityConfig(type: EntityType): EntityConfig<never> {
  const config = ENTITY_REGISTRY[type];
  if (!config) throw new Error(`No registry config for ${type}`);
  return config;
}

export const formatEnum = labelOf;
