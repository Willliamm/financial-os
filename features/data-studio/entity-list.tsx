"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { BaseEntity, EntityType } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { EntityConfig } from "./types";
import { getEntityConfig } from "./registry";
import { EntityFormDrawer } from "./entity-form-drawer";
import { useEntityActions } from "./use-entity-actions";

interface EntityListProps<T extends BaseEntity> {
  type: EntityType;
  entities: T[];
  context: FinancialContext;
  injectDefaults?: Record<string, unknown>;
  /** When true, clicking a row opens its detail route instead of the drawer. */
  onRowClick?: (entity: T) => void;
  addLabel?: string;
  searchable?: boolean;
}

export function EntityList<T extends BaseEntity>({
  type,
  entities,
  context,
  injectDefaults,
  onRowClick,
  addLabel,
  searchable = true,
}: EntityListProps<T>) {
  const config = getEntityConfig(type) as unknown as EntityConfig<T>;
  const { t } = useTranslation();
  const actions = useEntityActions();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return entities;
    const q = query.toLowerCase();
    return entities.filter((e) =>
      (config.searchText?.(e) ?? config.primary(e)).toLowerCase().includes(q),
    );
  }, [entities, query, config]);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }
  function openEdit(entity: T) {
    setEditing(entity);
    setDrawerOpen(true);
  }
  function activateRow(entity: T) {
    if (onRowClick) onRowClick(entity);
    else openEdit(entity);
  }

  const Icon = config.icon;
  const singularLower = t(config.singular).toLowerCase();
  const pluralLower = t(config.plural).toLowerCase();
  const addText = addLabel ?? `${t("common:actions.add")} ${singularLower}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {searchable ? (
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("dataStudio:list.searchPlaceholder", { items: pluralLower })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        ) : (
          <div />
        )}
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {addText}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon className="size-8" />}
          title={t("dataStudio:list.emptyTitle", { items: pluralLower })}
          description={t(config.description)}
          action={
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" />
              {addText}
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(config.singular)}</TableHead>
                {config.columns.map((c) => (
                  <TableHead
                    key={c.label}
                    className={cn(c.align === "right" && "text-right")}
                  >
                    {t(c.label)}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entity) => (
                <TableRow
                  key={entity.id}
                  className="cursor-pointer hover:bg-muted/50"
                  tabIndex={0}
                  role="button"
                  onClick={() => activateRow(entity)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (e.key === " ") e.preventDefault();
                      activateRow(entity);
                    }
                  }}
                >
                  <TableCell>
                    <div className="font-medium">{config.primary(entity)}</div>
                    {config.secondary ? (
                      <div className="text-xs text-muted-foreground">
                        {config.secondary(entity)}
                      </div>
                    ) : null}
                  </TableCell>
                  {config.columns.map((c) => (
                    <TableCell
                      key={c.label}
                      className={cn(
                        "tabular-nums",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {c.render(entity)}
                    </TableCell>
                  ))}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("dataStudio:list.rowActions", { name: config.primary(entity) })}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(entity)}>
                          <Pencil className="size-4" />
                          {t("common:actions.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setToDelete(entity)}
                        >
                          <Trash2 className="size-4" />
                          {t("common:actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EntityFormDrawer<T>
        config={config as unknown as EntityConfig<never>}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        entity={editing}
        context={context}
        injectDefaults={injectDefaults}
      />

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dataStudio:list.deleteTitle", { item: singularLower })}</DialogTitle>
            <DialogDescription>
              {t("dataStudio:list.deleteDescription", {
                name: toDelete ? config.primary(toDelete) : t("common:none"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!toDelete) return;
                setDeleting(true);
                try {
                  await actions.remove(type, toDelete.id, { sync: false });
                  setToDelete(null);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common:actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
