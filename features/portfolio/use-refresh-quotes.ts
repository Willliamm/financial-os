"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getGoogleClients } from "@/infrastructure/google";
import { refreshQuotes } from "@/infrastructure/market/quote-service";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { normalizeTicker } from "@/domain/value-objects/ticker";
import { useFinancialContext, useInvalidateFinancialData } from "@/lib/queries/financial-data";
import { useWorkbookStore } from "@/lib/stores/workbook-store";

/**
 * Manual refresh only. A static PWA has no scheduler, so an automatic hourly
 * update would be a lie in the UI. The user asks, the app fetches.
 */
export function useRefreshQuotes() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const invalidate = useInvalidateFinancialData();
  // The store holds the whole WorkbookRef, not a bare id.
  const workbookId = useWorkbookStore((s) => s.workbook?.id ?? null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!workbookId) {
      toast.error(t("portfolio:refresh.noWorkbook"));
      return;
    }
    const tickers = [
      ...new Set(
        context.holdings
          .filter((h) => !h.deletedAt && h.ticker.trim() !== "")
          .map((h) => normalizeTicker(h.ticker)),
      ),
    ];
    if (tickers.length === 0) return;

    setRunning(true);
    try {
      const result = await refreshQuotes(getGoogleClients(), workbookId, tickers, todayIsoDate());
      if (result.failed.length > 0) {
        toast.warning(t("portfolio:refresh.failed", { tickers: result.failed.join(", ") }));
      } else {
        toast.success(
          t("portfolio:refresh.success", { count: result.written, skipped: result.skippedSameDay }),
        );
      }
    } catch (error) {
      toast.error(String(error instanceof Error ? error.message : error));
    } finally {
      // Always refresh the view, even on a partial failure partway through
      // the per-ticker loop — quotes already written must not stay invisible
      // until something else happens to refetch.
      await invalidate();
      setRunning(false);
    }
  }, [context.holdings, invalidate, t, workbookId]);

  return { refresh, running };
}
