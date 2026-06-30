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
} from "./entities";

/**
 * A snapshot of all household financial data, used as the input to the
 * calculation engines. Engines are pure: given a context (and assumptions)
 * they return numbers. They never touch React, Dexie, or Google APIs.
 */
export interface FinancialContext {
  household: Household | null;
  people: Person[];
  incomeSources: IncomeSource[];
  expenses: Expense[];
  properties: Property[];
  loans: Loan[];
  investmentAccounts: InvestmentAccount[];
  taxStrategies: TaxStrategy[];
  taxAssumptions: TaxAssumption[];
  scenarios: Scenario[];
  scenarioAssumptions: ScenarioAssumption[];
}

export function emptyContext(): FinancialContext {
  return {
    household: null,
    people: [],
    incomeSources: [],
    expenses: [],
    properties: [],
    loans: [],
    investmentAccounts: [],
    taxStrategies: [],
    taxAssumptions: [],
    scenarios: [],
    scenarioAssumptions: [],
  };
}

/** Find the loan attached to a property, if any (first active match). */
export function loanForProperty(
  context: FinancialContext,
  propertyId: string,
): Loan | null {
  return (
    context.loans.find((l) => l.propertyId === propertyId && !l.deletedAt) ??
    null
  );
}
