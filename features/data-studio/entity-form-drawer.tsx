"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BaseEntity } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { MoneyInput } from "@/components/forms/money-input";
import { PercentInput } from "@/components/forms/percent-input";
import { LockBanner } from "@/components/locks/lock-banner";
import { useLockStore } from "@/lib/stores/lock-store";
import type { LockResult } from "@/infrastructure/sync/lock-manager";
import { cn } from "@/lib/utils";
import type { EntityConfig, FieldDef, SelectOption } from "./types";
import {
  deriveDefaults,
  entityToFormValues,
  formValuesToPayload,
  requiredFieldErrors,
} from "./form-utils";
import { useEntityActions } from "./use-entity-actions";

interface EntityFormDrawerProps<T extends BaseEntity> {
  config: EntityConfig<never>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: T | null;
  context: FinancialContext;
  injectDefaults?: Record<string, unknown>;
  onSaved?: (entity: T) => void;
}

export function EntityFormDrawer<T extends BaseEntity>({
  config,
  open,
  onOpenChange,
  entity,
  context,
  injectDefaults,
  onSaved,
}: EntityFormDrawerProps<T>) {
  const isEdit = Boolean(entity);
  const { t } = useTranslation();
  const actions = useEntityActions();
  const acquireLock = useLockStore((s) => s.acquire);
  const releaseLock = useLockStore((s) => s.release);
  const resourceType = config.resourceType ?? config.type;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lock, setLock] = useState<LockResult | null>(null);
  const [savingMode, setSavingMode] = useState<"local" | "sync" | null>(null);
  const [activeSection, setActiveSection] = useState(config.sections?.[0]);
  const saving = savingMode !== null;

  const readOnly = lock?.mode === "readonly";

  useEffect(() => {
    if (!open) return;
    const initial = entity
      ? entityToFormValues(config.fields, entity as Record<string, unknown>)
      : { ...deriveDefaults(config.fields), ...injectDefaults };
    setValues(initial);
    setErrors({});

    let active = true;
    let resourceKey: string | null = null;
    if (entity) {
      void acquireLock(resourceType, entity.id).then((result) => {
        if (active) {
          setLock(result);
          resourceKey = result.lock.resourceKey;
        }
      });
    } else {
      setLock(null);
    }
    return () => {
      active = false;
      if (resourceKey) void releaseLock(resourceKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity?.id]);

  const setField = (name: string, value: unknown) =>
    setValues((v) => ({ ...v, [name]: value }));

  async function handleSave(withSync: boolean) {
    const validation = requiredFieldErrors(config.fields, values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      if (config.sections?.length) {
        const firstErrored = config.fields.find((f) => validation[f.name]);
        if (firstErrored?.section) setActiveSection(firstErrored.section);
      }
      return;
    }
    setSavingMode(withSync ? "sync" : "local");
    try {
      const payload = formValuesToPayload(config.fields, values);
      let saved: T;
      if (isEdit && entity) {
        saved = await actions.update<T>(
          config.type,
          { ...(payload as Partial<T>), id: entity.id },
          { sync: withSync },
        );
      } else {
        const injected = config.inject ? config.inject({ householdId: context.household?.id ?? null }) : {};
        saved = await actions.create<T>(
          config.type,
          { ...(payload as Partial<T>), ...(injected as Partial<T>) },
          { sync: withSync },
        );
      }
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSavingMode(null);
    }
  }

  const sections = config.sections ?? [null];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isEdit
              ? t("forms:drawer.edit", { item: t(config.singular) })
              : t("forms:drawer.new", { item: t(config.singular) })}
          </SheetTitle>
          <SheetDescription>{t(config.description)}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {lock ? <LockBanner lock={lock} /> : null}

            {Object.keys(errors).length > 0 ? (
              <Alert variant="destructive">
                {t("forms:validation.fixFields", { count: Object.keys(errors).length })}
              </Alert>
            ) : null}

            {config.sections ? (
              <Tabs value={activeSection} onValueChange={setActiveSection}>
                <TabsList className="flex w-full flex-wrap">
                  {config.sections.map((s) => (
                    <TabsTrigger key={s} value={s}>
                      {t(s)}
                      {config.fields.some(
                        (f) => f.section === s && errors[f.name],
                      ) ? (
                        <span className="ml-1.5 size-1.5 rounded-full bg-destructive" />
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {config.sections.map((s) => (
                  <TabsContent key={s} value={s} className="mt-4">
                    <FieldGrid
                      fields={config.fields.filter((f) => f.section === s)}
                      values={values}
                      errors={errors}
                      readOnly={readOnly}
                      context={context}
                      setField={setField}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <FieldGrid
                fields={config.fields}
                values={values}
                errors={errors}
                readOnly={readOnly}
                context={context}
                setField={setField}
              />
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleSave(false)}
            disabled={saving || readOnly}
          >
            {savingMode === "local" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {t("common:actions.saveLocally")}
          </Button>
          <Button onClick={() => void handleSave(true)} disabled={saving || readOnly}>
            {savingMode === "sync" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {t("common:actions.saveAndSync")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FieldGrid({
  fields,
  values,
  errors,
  readOnly,
  context,
  setField,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  errors: Record<string, string>;
  readOnly: boolean;
  context: FinancialContext;
  setField: (name: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((field) => (
        <div
          key={field.name}
          className={cn(field.colSpan === 2 ? "col-span-2" : "col-span-2 sm:col-span-1")}
        >
          <Label htmlFor={field.name} className="mb-1.5 block text-xs font-medium">
            {t(field.label)}
            {field.required ? (
              <>
                <span className="ml-0.5 text-red-500">*</span>
                <span className="sr-only"> {t("forms:field.required")}</span>
              </>
            ) : null}
          </Label>
          <FieldControl
            field={field}
            value={values[field.name]}
            readOnly={readOnly}
            context={context}
            invalid={Boolean(errors[field.name])}
            describedBy={errors[field.name] ? `${field.name}-error` : undefined}
            onChange={(v) => setField(field.name, v)}
          />
          {field.help ? (
            <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
          ) : null}
          {errors[field.name] ? (
            <p id={`${field.name}-error`} className="mt-1 text-xs text-red-500">
              {t(errors[field.name])}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function dynamicOptions(
  field: FieldDef,
  context: FinancialContext,
): SelectOption[] {
  if (field.dynamicOptions === "people") {
    return [
      { value: "", label: "— None —" },
      ...context.people.map((p) => ({ value: p.id, label: p.name })),
    ];
  }
  if (field.dynamicOptions === "properties") {
    return [
      { value: "", label: "— None —" },
      ...context.properties.map((p) => ({ value: p.id, label: p.name })),
    ];
  }
  if (field.dynamicOptions === "scenarios") {
    return [
      { value: "", label: "— None —" },
      ...context.scenarios.map((s) => ({ value: s.id, label: s.name })),
    ];
  }
  return field.options ?? [];
}

function FieldControl({
  field,
  value,
  readOnly,
  context,
  invalid,
  describedBy,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  readOnly: boolean;
  context: FinancialContext;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: unknown) => void;
}) {
  const ariaProps = {
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  };
  switch (field.type) {
    case "money":
      return (
        <MoneyInput
          id={field.name}
          value={Number(value) || 0}
          onChange={onChange}
          disabled={readOnly}
          {...ariaProps}
        />
      );
    case "percent":
      return (
        <PercentInput
          id={field.name}
          value={Number(value) || 0}
          onChange={onChange}
          disabled={readOnly}
          {...ariaProps}
        />
      );
    case "number":
      return (
        <Input
          id={field.name}
          type="number"
          inputMode="numeric"
          disabled={readOnly}
          value={value === 0 || value ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          {...ariaProps}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={field.name}
          disabled={readOnly}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          {...ariaProps}
        />
      );
    case "switch":
      return (
        <div className="flex h-9 items-center">
          <Switch
            id={field.name}
            checked={Boolean(value)}
            disabled={readOnly}
            onCheckedChange={onChange}
            {...ariaProps}
          />
        </div>
      );
    case "date":
      return (
        <Input
          id={field.name}
          type="date"
          disabled={readOnly}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
          {...ariaProps}
        />
      );
    case "select": {
      const options = dynamicOptions(field, context);
      return (
        <Select
          value={value ? String(value) : "__none__"}
          disabled={readOnly}
          onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
        >
          <SelectTrigger id={field.name} className="w-full" {...ariaProps}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value || "none"} value={o.value || "__none__"}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    default:
      return (
        <Input
          id={field.name}
          disabled={readOnly}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          {...ariaProps}
        />
      );
  }
}
