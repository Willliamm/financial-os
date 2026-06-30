import type { AnyEntity } from "@/domain/entities";
import type { EntityType } from "@/domain/entities/base";
import { ENTITY_SCHEMAS } from "@/domain/schemas";
import { createLogger } from "@/lib/logger";
import { SHEET_COLUMNS, type ColumnDef } from "./sheet-schema";

const log = createLogger("sheet-mapper");

function formatCell(value: unknown, type: ColumnDef["type"]): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "TRUE" : "FALSE";
  if (type === "number") {
    return Number.isFinite(value as number) ? String(value) : "";
  }
  return String(value);
}

function coerceCell(
  raw: string | undefined,
  type: ColumnDef["type"],
): unknown | undefined {
  const value = raw ?? "";
  if (type === "boolean") {
    if (value === "") return undefined;
    return /^(true|1|yes)$/i.test(value);
  }
  if (value === "") return undefined;
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return value;
}

/** Serialize a domain entity into an ordered row of string cells. */
export function entityToRow(type: EntityType, entity: object): string[] {
  const rec = entity as Record<string, unknown>;
  return SHEET_COLUMNS[type].map((c) => formatCell(rec[c.field], c.type));
}

/** Build a header->index lookup tolerant of column reordering in the sheet. */
function headerIndex(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => map.set(h.trim(), i));
  return map;
}

/**
 * Parse a single sheet row into a validated entity, or null if it fails Zod
 * validation. Resilient to a malformed cell so one bad row never aborts an
 * import.
 */
export function rowToEntity(
  type: EntityType,
  headerRow: string[],
  row: string[],
): AnyEntity | null {
  const cols = SHEET_COLUMNS[type];
  const idx = headerIndex(headerRow);
  const raw: Record<string, unknown> = {};

  for (const c of cols) {
    const cellIndex = idx.has(c.header)
      ? (idx.get(c.header) as number)
      : cols.indexOf(c);
    const coerced = coerceCell(row[cellIndex], c.type);
    if (coerced !== undefined) {
      raw[c.field] = coerced;
    }
  }

  const schema = ENTITY_SCHEMAS[type];
  const result = schema.safeParse(raw);
  if (!result.success) {
    log.warn(`Dropping invalid ${type} row`, {
      id: raw.id,
      issues: result.error.issues.slice(0, 3),
    });
    return null;
  }
  return result.data as AnyEntity;
}

/** Generic header-mapped object reader for technical tabs. */
export function rowsToObjects(
  headerRow: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    headerRow.forEach((header, i) => {
      obj[header.trim()] = row[i] ?? "";
    });
    return obj;
  });
}

/**
 * Find the 1-based sheet row number for an entity id by scanning the id
 * column. Returns null when not present (i.e. the row must be appended).
 */
export function findRowNumberById(
  values: string[][],
  id: string,
): number | null {
  if (values.length === 0) return null;
  const idCol = values[0].indexOf("id");
  const col = idCol >= 0 ? idCol : 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i][col] === id) return i + 1; // 1-based
  }
  return null;
}
