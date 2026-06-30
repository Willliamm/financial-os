import type { EntityType } from "@/domain/entities/base";

/** Every mutation in the app is expressed as a Command. */
export type CommandOperation = "create" | "update" | "delete";

export type CommandStatus =
  | "pending"
  | "applied"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

export type CommandType =
  | "CreateHousehold"
  | "UpdateHousehold"
  | "DeleteHousehold"
  | "CreatePerson"
  | "UpdatePerson"
  | "DeletePerson"
  | "CreateIncomeSource"
  | "UpdateIncomeSource"
  | "DeleteIncomeSource"
  | "CreateExpense"
  | "UpdateExpense"
  | "DeleteExpense"
  | "CreateProperty"
  | "UpdateProperty"
  | "DeleteProperty"
  | "CreateLoan"
  | "UpdateLoan"
  | "DeleteLoan"
  | "CreateInvestmentAccount"
  | "UpdateInvestmentAccount"
  | "DeleteInvestmentAccount"
  | "CreateTaxStrategy"
  | "UpdateTaxStrategy"
  | "DeleteTaxStrategy"
  | "CreateTaxAssumption"
  | "UpdateTaxAssumption"
  | "DeleteTaxAssumption"
  | "CreateScenario"
  | "UpdateScenario"
  | "DeleteScenario"
  | "CreateScenarioAssumption"
  | "UpdateScenarioAssumption"
  | "DeleteScenarioAssumption"
  | "CreateProjectionSnapshot"
  | "DeleteProjectionSnapshot";

export interface Command<TPayload = unknown> {
  id: string;
  type: CommandType;
  entityType: EntityType;
  entityId: string;
  operation: CommandOperation;
  payload: TPayload;
  userId: string;
  userEmail: string;
  sessionId: string;
  createdAt: string;
  status: CommandStatus;
}

const ENTITY_PASCAL: Record<EntityType, string> = {
  household: "Household",
  person: "Person",
  income_source: "IncomeSource",
  expense: "Expense",
  property: "Property",
  loan: "Loan",
  investment_account: "InvestmentAccount",
  tax_strategy: "TaxStrategy",
  tax_assumption: "TaxAssumption",
  scenario: "Scenario",
  scenario_assumption: "ScenarioAssumption",
  projection_snapshot: "ProjectionSnapshot",
};

const OP_PREFIX: Record<CommandOperation, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
};

/** Derive the CommandType string from an entity type + operation. */
export function commandTypeFor(
  entityType: EntityType,
  operation: CommandOperation,
): CommandType {
  return `${OP_PREFIX[operation]}${ENTITY_PASCAL[entityType]}` as CommandType;
}
