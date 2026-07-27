"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { PriceQuote } from "@/domain/entities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/forms/money-input";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { normalizeTicker } from "@/domain/value-objects/ticker";
import { useEntityActions } from "@/features/data-studio/use-entity-actions";

export interface SetPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  /** Prefills the price field so a small correction is one keystroke. */
  currentPriceCents: number;
}

/**
 * Manual price entry — always available, whatever the quote feed does. It is
 * the fallback for tickers Google does not cover and for a failed refresh.
 * Always writes for today; there is no backdating a manual price.
 */
export function SetPriceDialog({
  open,
  onOpenChange,
  ticker,
  currentPriceCents,
}: SetPriceDialogProps) {
  const { t } = useTranslation();
  const { create } = useEntityActions();

  const [priceCents, setPriceCents] = useState(currentPriceCents);
  const [saving, setSaving] = useState(false);

  // Reset to the current price only on the closed→open transition, not on
  // every re-render while open. currentPriceCents can change while the dialog
  // is open (background sync, another tab, a TanStack Query refetch on window
  // focus) and must not clobber an in-progress edit.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPriceCents(currentPriceCents);
      setSaving(false);
    }
    wasOpen.current = open;
    // currentPriceCents is intentionally read only at the open transition
    // above, not tracked as a dependency that would re-fire this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      await create<PriceQuote>("price_quote", {
        ticker: normalizeTicker(ticker),
        quoteDate: todayIsoDate(),
        priceCents,
        source: "manual",
      });
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("portfolio:manualPrice.saveError"), { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("portfolio:manualPrice.title")}</DialogTitle>
          <DialogDescription>
            {t("portfolio:manualPrice.subtitle", { ticker })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="manual-price">{t("portfolio:manualPrice.label")}</Label>
          <MoneyInput
            id="manual-price"
            value={priceCents}
            onChange={setPriceCents}
            disabled={saving}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || priceCents <= 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? t("common:status.saving") : t("portfolio:manualPrice.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
