import { describe, it, expect, beforeEach } from "vitest";
import type { Holding, Lot, PriceQuote } from "@/domain/entities";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { loadFinancialContext } from "@/infrastructure/db/repositories";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend } from "@/infrastructure/google/mocks/mock-backend";
import { initWorkbook } from "@/infrastructure/sync/workbook-manager";
import { importWorkbook, pushPending } from "@/infrastructure/sync/sync-engine";
import { headersFor } from "@/infrastructure/sync/sheet-schema";
import { refreshQuotes } from "@/infrastructure/market/quote-service";
import { selectLatestPrices } from "@/lib/queries/market-data";
import { sharesToMicros } from "@/domain/value-objects/shares";

function baseHolding(): Partial<Holding> {
  return {
    accountId: "acct-1",
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    assetClass: "us_equity",
    targetAllocationBps: 6000,
  };
}

function baseLot(holdingId: string): Partial<Lot> {
  return {
    holdingId,
    tradeDate: "2026-01-15",
    sharesMicro: sharesToMicros(10),
    costTotalCents: 500_000,
    feesCents: 0,
    status: "open",
    closeDate: null,
    proceedsCents: 0,
    note: "",
  };
}

describe("portfolio flow (Dexie + mock Google)", () => {
  beforeEach(async () => {
    resetDbSingleton();
    const db = getDb();
    await Promise.all(
      [
        db.entities,
        db.commands,
        db.syncQueue,
        db.locks,
        db.conflicts,
        db.metadata,
        db.snapshots,
      ].map((t) => t.clear()),
    );
    getMockBackend().resetAll();
  });

  it("writes a holding and its lots as entity + command + queue item", async () => {
    const { entity: holding } = await createEntity<Holding>(
      "holding",
      baseHolding(),
    );
    const { entity: lot1 } = await createEntity<Lot>(
      "lot",
      baseLot(holding.id),
    );
    const { entity: lot2 } = await createEntity<Lot>(
      "lot",
      { ...baseLot(holding.id), tradeDate: "2026-06-01", sharesMicro: sharesToMicros(2), costTotalCents: 130_000 },
    );

    const db = getDb();
    for (const id of [holding.id, lot1.id, lot2.id]) {
      expect(await db.entities.get(id)).toBeTruthy();
      expect(await db.commands.where("entityId").equals(id).count()).toBe(1);
    }
    expect(await db.syncQueue.where("entityType").equals("holding").count()).toBe(1);
    const lotQueueItems = await db.syncQueue
      .where("entityType")
      .equals("lot")
      .toArray();
    expect(lotQueueItems.filter((i) => i.entityId === lot1.id)).toHaveLength(1);
    expect(lotQueueItems.filter((i) => i.entityId === lot2.id)).toHaveLength(1);
  });

  it("pushes holding and lots to the sheets and re-imports them", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);

    const { entity: holding } = await createEntity<Holding>(
      "holding",
      baseHolding(),
    );
    const { entity: lot1 } = await createEntity<Lot>(
      "lot",
      baseLot(holding.id),
    );
    const { entity: lot2 } = await createEntity<Lot>(
      "lot",
      { ...baseLot(holding.id), tradeDate: "2026-06-01", sharesMicro: sharesToMicros(2), costTotalCents: 130_000 },
    );

    const summary = await pushPending(clients, wb.id);
    expect(summary.pushed).toBe(3);

    const holdingRows = getMockBackend()
      .getSheet("holdings")
      .slice(1)
      .filter((row) => row[0] === holding.id);
    expect(holdingRows).toHaveLength(1);

    const lotRows = getMockBackend()
      .getSheet("lots")
      .slice(1)
      .filter((row) => row[0] === lot1.id || row[0] === lot2.id);
    expect(lotRows).toHaveLength(2);

    const lotHeaders = headersFor("lot");
    const sharesCol = lotHeaders.indexOf("shares_micro");
    const costCol = lotHeaders.indexOf("cost_total_cents");
    const lot1Row = lotRows.find((row) => row[0] === lot1.id)!;
    const lot2Row = lotRows.find((row) => row[0] === lot2.id)!;
    expect(lot1Row[sharesCol]).toBe(String(sharesToMicros(10)));
    expect(lot1Row[costCol]).toBe("500000");
    expect(lot2Row[sharesCol]).toBe(String(sharesToMicros(2)));
    expect(lot2Row[costCol]).toBe("130000");

    await getDb().entities.clear();
    await importWorkbook(clients, wb.id);

    const reimportedHoldings = await repositories.holding.list();
    expect(reimportedHoldings).toHaveLength(1);
    expect(reimportedHoldings[0].ticker).toBe("VOO");
    expect(reimportedHoldings[0].targetAllocationBps).toBe(6000);

    const reimportedLots = await repositories.lot.list();
    expect(reimportedLots).toHaveLength(2);
    const reimportedLot1 = reimportedLots.find((l) => l.id === lot1.id)!;
    expect(reimportedLot1.sharesMicro).toBe(sharesToMicros(10));
    expect(reimportedLot1.costTotalCents).toBe(500_000);
    const reimportedLot2 = reimportedLots.find((l) => l.id === lot2.id)!;
    expect(reimportedLot2.sharesMicro).toBe(sharesToMicros(2));
    expect(reimportedLot2.costTotalCents).toBe(130_000);
  });

  it("refreshes quotes for a holding's ticker and surfaces the latest price", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);
    await createEntity<Holding>("holding", baseHolding());

    const today = getMockBackend().today();
    const result = await refreshQuotes(clients, wb.id, ["VOO"], today);
    expect(result.written).toBe(1);

    const allQuotes = await repositories.price_quote.list();
    expect(allQuotes.filter((q: PriceQuote) => q.ticker === "VOO")).toHaveLength(1);

    const context = await loadFinancialContext();
    const { prices } = selectLatestPrices(context);
    expect(prices.VOO).toBe(allQuotes.find((q) => q.ticker === "VOO")!.priceCents);
  });
});
