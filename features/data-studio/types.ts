import type { LucideIcon } from "lucide-react";
import type { EntityType } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";

export type FieldType =
  | "text"
  | "textarea"
  | "money"
  | "percent"
  | "number"
  | "select"
  | "switch"
  | "date";

export interface SelectOption {
  label: string;
  value: string;
  /** When true, `label` is literal display text (e.g. an entity name) and
   * must NOT be passed through `t(...)`. When false/absent, `label` is an
   * i18n key that render sites must translate. */
  raw?: boolean;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
  /** Pull options from the loaded context at render time. */
  dynamicOptions?: "people" | "properties" | "scenarios";
  required?: boolean;
  placeholder?: string;
  help?: string;
  section?: string;
  colSpan?: 1 | 2;
  /** Default value in form space (cents for money, bps for percent). */
  defaultValue?: unknown;
}

export interface ListColumn<T> {
  label: string;
  align?: "left" | "right";
  /**
   * `context` lets a column resolve a reference to another entity — e.g. an
   * observation naming the account it marks. Most columns ignore it.
   */
  render: (entity: T, context: FinancialContext) => React.ReactNode;
}

export interface EntityConfig<T> {
  type: EntityType;
  singular: string;
  plural: string;
  icon: LucideIcon;
  /** route under the app shell, e.g. "/income" */
  href: string;
  /** Data Studio short description. */
  description: string;
  /** lock resource type; defaults to the entity type. */
  resourceType?: string;
  /** Fields shown in the create/edit form. */
  fields: FieldDef[];
  /** Ordered section/tab names; when absent the form is a single column. */
  sections?: string[];
  /** Columns shown in the list/table. */
  columns: ListColumn<T>[];
  /**
   * Title and subtitle for list rows / cards. `context` is supplied so a row
   * can name a referenced entity rather than showing a raw id or a bare type.
   */
  primary: (entity: T, context: FinancialContext) => string;
  secondary?: (entity: T, context: FinancialContext) => string;
  /** Free-text used for client-side search. */
  searchText?: (entity: T, context: FinancialContext) => string;
  /** Fields injected on create that are not part of the form (e.g. householdId). */
  inject?: (ctx: RegistryContext) => Record<string, unknown>;
}

export interface RegistryContext {
  householdId: string | null;
  /** Optional parent id for child entities (loan.propertyId, etc). */
  parentId?: string | null;
}
