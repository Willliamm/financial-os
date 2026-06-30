/** Entity types that participate in sync and the command pipeline. */
export type EntityType =
  | "household"
  | "person"
  | "income_source"
  | "expense"
  | "property"
  | "loan"
  | "investment_account"
  | "tax_strategy"
  | "tax_assumption"
  | "scenario"
  | "scenario_assumption"
  | "projection_snapshot";

/** Fields every persisted domain entity shares. */
export interface BaseEntity {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** Maps each entity type to its Google Sheets worksheet/tab name. */
export const ENTITY_SHEET: Record<EntityType, string> = {
  household: "households",
  person: "people",
  income_source: "income_sources",
  expense: "expenses",
  property: "properties",
  loan: "loans",
  investment_account: "investment_accounts",
  tax_strategy: "tax_strategies",
  tax_assumption: "tax_assumptions",
  scenario: "scenarios",
  scenario_assumption: "scenario_assumptions",
  projection_snapshot: "projection_snapshots",
};

/** Lock resource type for an entity (used in __locks resource_key). */
export const ENTITY_LOCK_TYPE: Record<EntityType, string> = {
  household: "household",
  person: "person",
  income_source: "income_source",
  expense: "expense",
  property: "property",
  loan: "loan",
  investment_account: "investment_account",
  tax_strategy: "tax_strategy",
  tax_assumption: "tax_assumption",
  scenario: "scenario",
  scenario_assumption: "scenario_assumption",
  projection_snapshot: "projection_snapshot",
};
