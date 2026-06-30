import type { FieldDef } from "./types";

/** Build the default form values for a set of fields. */
export function deriveDefaults(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      out[f.name] = f.defaultValue;
      continue;
    }
    switch (f.type) {
      case "money":
      case "percent":
      case "number":
        out[f.name] = 0;
        break;
      case "switch":
        out[f.name] = false;
        break;
      case "select":
        out[f.name] = f.options?.[0]?.value ?? "";
        break;
      default:
        out[f.name] = "";
    }
  }
  return out;
}

/** Pull just the form-relevant fields out of an existing entity for editing. */
export function entityToFormValues(
  fields: FieldDef[],
  entity: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = entity[f.name];
    if (value === null || value === undefined) {
      out[f.name] = deriveDefaults([f])[f.name];
    } else {
      out[f.name] = value;
    }
  }
  return out;
}

/**
 * Normalize raw form values into an entity payload. Money fields already hold
 * cents and percent fields already hold basis points (the inputs emit those
 * units), so the main job here is coercing number-typed fields and trimming
 * empty optional strings to null.
 */
export function formValuesToPayload(
  fields: FieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    switch (f.type) {
      case "money":
      case "percent":
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        out[f.name] = Number.isFinite(n) ? n : 0;
        break;
      }
      case "switch":
        out[f.name] = Boolean(v);
        break;
      case "date":
        out[f.name] = v ? String(v) : null;
        break;
      case "select":
        out[f.name] = v === "" ? null : v;
        break;
      default:
        out[f.name] = v ?? "";
    }
  }
  return out;
}

/**
 * i18n key for the "field is required" message. `requiredFieldErrors` returns
 * this key (not display text) as the error value; the form drawer renders it
 * with `t(...)` so the message is localized at the render layer.
 */
export const REQUIRED_ERROR_KEY = "forms:validation.required";

export function requiredFieldErrors(
  fields: FieldDef[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.name];
    if (f.type === "money" || f.type === "number" || f.type === "percent") {
      if (!v || Number(v) <= 0) errors[f.name] = REQUIRED_ERROR_KEY;
    } else if (!v || String(v).trim() === "") {
      errors[f.name] = REQUIRED_ERROR_KEY;
    }
  }
  return errors;
}
