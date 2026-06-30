"use client";

import type { BaseEntity, EntityType } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";
import { PageHeader } from "@/components/shared/page-header";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { EntityList } from "./entity-list";
import { getEntityConfig } from "./registry";

/** Pick the entity array for a given type out of the loaded context. */
export function selectEntities(
  context: FinancialContext,
  type: EntityType,
): BaseEntity[] {
  switch (type) {
    case "income_source":
      return context.incomeSources;
    case "expense":
      return context.expenses;
    case "property":
      return context.properties;
    case "loan":
      return context.loans;
    case "investment_account":
      return context.investmentAccounts;
    case "tax_strategy":
      return context.taxStrategies;
    case "tax_assumption":
      return context.taxAssumptions;
    case "scenario":
      return context.scenarios;
    case "scenario_assumption":
      return context.scenarioAssumptions;
    case "person":
      return context.people;
    case "household":
      return context.household ? [context.household] : [];
    default:
      return [];
  }
}

interface ListScreenProps {
  type: EntityType;
  title: string;
  description: string;
  injectDefaults?: Record<string, unknown>;
  header?: React.ReactNode;
  children?: React.ReactNode;
  onRowClick?: (entity: BaseEntity) => void;
}

export function ListScreen({
  type,
  title,
  description,
  injectDefaults,
  header,
  children,
  onRowClick,
}: ListScreenProps) {
  const { data: context } = useFinancialContext();
  getEntityConfig(type); // assert config exists
  const entities = selectEntities(context, type);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      {header}
      {children}
      <EntityList
        type={type}
        entities={entities}
        context={context}
        injectDefaults={injectDefaults}
        onRowClick={onRowClick}
      />
    </div>
  );
}
