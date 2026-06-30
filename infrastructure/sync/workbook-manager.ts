import {
  APP_NAME,
  APP_SCHEMA_VERSION,
  DEFAULT_CURRENCY,
  DEFAULT_WORKBOOK_NAME,
  LOCK_TTL_SECONDS,
} from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { nowIso } from "@/infrastructure/dates/date-utils";
import type { EntityType } from "@/domain/entities/base";
import type {
  GoogleClients,
  SheetDefinition,
  WorkbookRef,
} from "../google/google-api-types";
import { headersFor, SHEET_COLUMNS, TECHNICAL_SHEETS } from "./sheet-schema";

const log = createLogger("workbook");

export const DOMAIN_ENTITY_TYPES = Object.keys(SHEET_COLUMNS) as EntityType[];

function allSheetDefinitions(): SheetDefinition[] {
  const domain: SheetDefinition[] = DOMAIN_ENTITY_TYPES.map((type) => ({
    name: sheetName(type),
    headers: headersFor(type),
  }));
  const technical: SheetDefinition[] = Object.entries(TECHNICAL_SHEETS).map(
    ([name, headers]) => ({ name, headers }),
  );
  return [...technical, ...domain];
}

export function sheetName(type: EntityType): string {
  // Worksheet name equals the plural snake_case used in the spec.
  return DOMAIN_SHEET_NAMES[type];
}

const DOMAIN_SHEET_NAMES: Record<EntityType, string> = {
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

/**
 * Find the Financial OS workbook in Drive (or create it), then make sure every
 * required sheet exists with its header row. Seeds the __meta tab on creation.
 */
export async function initWorkbook(
  clients: GoogleClients,
): Promise<WorkbookRef> {
  let workbook = await clients.drive.findWorkbook();
  const isNew = !workbook;
  if (!workbook) {
    log.info("No workbook found, creating one");
    workbook = await clients.drive.createWorkbook(DEFAULT_WORKBOOK_NAME);
  }

  await clients.sheets.ensureSheets(workbook.id, allSheetDefinitions());

  if (isNew) {
    await seedMeta(clients, workbook.id);
  }

  return workbook;
}

async function seedMeta(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<void> {
  const ts = nowIso();
  const rows: string[][] = [
    ["schema_version", String(APP_SCHEMA_VERSION), ts],
    ["app_name", APP_NAME, ts],
    ["workbook_id", spreadsheetId, ts],
    ["default_currency", DEFAULT_CURRENCY, ts],
    ["lock_ttl_seconds", String(LOCK_TTL_SECONDS), ts],
    ["created_at", ts, ts],
    ["updated_at", ts, ts],
  ];
  await clients.sheets.appendRows(spreadsheetId, "__meta", rows);
}

export { DOMAIN_SHEET_NAMES };
