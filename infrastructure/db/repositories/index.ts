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
import type { ProjectionSnapshot } from "@/domain/entities";
import type { EntityType } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";
import { EntityRepository } from "./entity-repository";

export const repositories = {
  household: new EntityRepository<Household>("household"),
  person: new EntityRepository<Person>("person"),
  income_source: new EntityRepository<IncomeSource>("income_source"),
  expense: new EntityRepository<Expense>("expense"),
  property: new EntityRepository<Property>("property"),
  loan: new EntityRepository<Loan>("loan"),
  investment_account: new EntityRepository<InvestmentAccount>(
    "investment_account",
  ),
  tax_strategy: new EntityRepository<TaxStrategy>("tax_strategy"),
  tax_assumption: new EntityRepository<TaxAssumption>("tax_assumption"),
  scenario: new EntityRepository<Scenario>("scenario"),
  scenario_assumption: new EntityRepository<ScenarioAssumption>(
    "scenario_assumption",
  ),
  projection_snapshot: new EntityRepository<ProjectionSnapshot>(
    "projection_snapshot",
  ),
} as const;

export function repositoryFor(type: EntityType): EntityRepository<never> {
  return repositories[type] as unknown as EntityRepository<never>;
}

/** Load every entity from IndexedDB into an in-memory FinancialContext. */
export async function loadFinancialContext(): Promise<FinancialContext> {
  const [
    households,
    people,
    incomeSources,
    expenses,
    properties,
    loans,
    investmentAccounts,
    taxStrategies,
    taxAssumptions,
    scenarios,
    scenarioAssumptions,
  ] = await Promise.all([
    repositories.household.list(),
    repositories.person.list(),
    repositories.income_source.list(),
    repositories.expense.list(),
    repositories.property.list(),
    repositories.loan.list(),
    repositories.investment_account.list(),
    repositories.tax_strategy.list(),
    repositories.tax_assumption.list(),
    repositories.scenario.list(),
    repositories.scenario_assumption.list(),
  ]);

  return {
    household: households[0] ?? null,
    people,
    incomeSources,
    expenses,
    properties,
    loans,
    investmentAccounts,
    taxStrategies,
    taxAssumptions,
    scenarios,
    scenarioAssumptions,
  };
}

export { EntityRepository };
