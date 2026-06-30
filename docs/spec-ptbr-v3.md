# Financial OS — Especificação Técnica para Desenvolvimento com Claude Code

> **Versão:** 3.0  
> **Idioma:** Português do Brasil  
> **Objetivo:** este arquivo deve ser usado como input principal em uma sessão do Claude Code para desenvolver o MVP do aplicativo.  
> **Regra principal:** o produto deve ser um **web app estático, sem backend próprio**, com dados operacionais em **IndexedDB/Dexie** e sincronização/persistência em **Google Sheets + Google Drive**.

---

## 1. Visão Geral do Produto

O **Financial OS** é um aplicativo web para planejamento financeiro pessoal avançado, combinando:

- patrimônio líquido;
- renda ativa e passiva;
- imóveis;
- financiamentos;
- investimentos;
- aposentadoria;
- planejamento tributário;
- cenários de longo prazo;
- simulações de compra de imóveis;
- projeções de independência financeira;
- recomendações inteligentes baseadas em dados.

A proposta é entregar a experiência de um software moderno, mas com a transparência e portabilidade de uma planilha. O usuário **não deve sentir que está preenchendo uma planilha**. Ele deve interagir com dashboards, cards, formulários, wizards, drawers e comparadores. O Google Sheets é apenas o mecanismo de persistência e interoperabilidade.

---

## 2. Decisões Arquiteturais Obrigatórias

### 2.1 Sem backend próprio no MVP

Não implementar:

- API própria;
- Next.js API routes;
- Next.js Server Actions;
- middleware server-side;
- SSR dependente de dados do usuário;
- banco SQL remoto;
- Firebase/Supabase;
- workers server-side próprios;
- armazenamento de dados financeiros em infraestrutura nossa.

### 2.2 App estático

O Next.js será usado como framework de desenvolvimento, organização e build, mas o deploy final deve ser estático.

O app deve ser exportável com:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
```

### 2.3 IndexedDB é o banco operacional

O **Google Sheets não deve ser tratado como runtime database**.

O runtime database será:

```text
Dexie.js → IndexedDB
```

O Google Sheets será:

```text
Persistência externa + interoperabilidade + backup legível pelo usuário
```

### 2.4 Offline-first

Após o primeiro carregamento e importação do workbook, o app deve conseguir:

- abrir dados locais;
- editar dados localmente;
- calcular dashboards;
- criar comandos pendentes;
- sincronizar quando a conexão voltar.

### 2.5 AI-friendly development

A stack deve ser escolhida pelo que é melhor para desenvolvimento com agentes de código, não pela experiência prévia do usuário.

Prioridades:

- baixo boilerplate;
- componentes prontos;
- padrões amplamente conhecidos;
- TypeScript forte;
- schemas explícitos;
- separação clara de camadas;
- testes simples;
- código modular.

---

## 3. Stack Técnica

### 3.1 Framework e UI

Usar:

- **Next.js 15+** com App Router;
- **React 19+**;
- **TypeScript** em modo strict;
- **Tailwind CSS**;
- **shadcn/ui**;
- **Radix UI**;
- **Lucide React**.

### 3.2 Estado, dados e forms

Usar:

- **Zustand** para estado global simples;
- **TanStack Query** para cache e estados assíncronos locais/remotos;
- **TanStack Table** para tabelas ricas;
- **TanStack Virtual** para listas grandes;
- **React Hook Form + Zod** ou **TanStack Form + Zod** para formulários;
- **Zod** para validação de todas as entidades e inputs.

### 3.3 Persistência local e sync

Usar:

- **Dexie.js** para IndexedDB;
- Google Identity Services;
- Google Drive API;
- Google Sheets API.

### 3.4 Cálculos e visualização

Usar:

- **Apache ECharts** para gráficos;
- **date-fns** para datas;
- utilitário próprio de dinheiro usando centavos ou **Dinero.js**;
- percentuais em basis points;
- **dnd-kit** para drag and drop;
- **React Flow** futuramente para diagramas, se necessário.

### 3.5 Testes

Usar:

- **Vitest** para unit tests;
- **Testing Library** para componentes;
- **Playwright** para E2E;
- mocks das APIs do Google.

---

## 4. Arquitetura de Alto Nível

```text
┌────────────────────────────────────────────────────────────┐
│                  Static Hosting                            │
│       GitHub Pages / Cloudflare Pages / Netlify             │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                  Next.js Static SPA                         │
│        React + TypeScript + Tailwind + shadcn/ui            │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                  Application Layer                          │
│  Screens | Forms | View Models | Commands | Use Cases       │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                    Domain Layer                             │
│ Tax Engine | Real Estate Engine | Loan Engine | Scenario    │
│ Net Worth Engine | FIRE Engine | Validation Rules           │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                 Local Persistence Layer                     │
│                    Dexie / IndexedDB                        │
│ Entities | Commands | Sync Queue | Snapshots | Conflicts    │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                     Sync Engine                             │
│ Lock Manager | Batch Writer | Sheet Mapper | Migrator       │
│ Conflict Resolver | Importer | Exporter                     │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                     Google APIs                             │
│    Google Identity Services | Drive API | Sheets API        │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                     Google Drive                            │
│           Financial OS Workbook — Google Sheets             │
└────────────────────────────────────────────────────────────┘
```

---

## 5. Fluxos Principais

### 5.1 Inicialização

```text
1. Usuário abre o app estático.
2. App carrega shell da UI.
3. Usuário faz login com Google.
4. App solicita scopes mínimos.
5. App procura workbook Financial OS no Google Drive.
6. Se não existir, cria workbook com abas e headers.
7. App lê __meta e valida schema_version.
8. Se necessário, executa migrations.
9. App baixa todas as abas de domínio.
10. App valida rows com Zod.
11. App importa dados para IndexedDB.
12. App calcula dashboards localmente.
13. UI é liberada.
```

### 5.2 Edição

```text
1. Usuário abre uma entidade em modo edição.
2. App tenta adquirir lock do recurso.
3. Se lock for adquirido, abre formulário.
4. Usuário altera campos.
5. Form valida com Zod.
6. Submit gera um Command.
7. Command é aplicado em transação Dexie.
8. Command entra na Sync Queue.
9. UI mostra estado dirty/local changes.
10. Sync Engine tenta sincronizar com Google Sheets.
11. Se sucesso, marca command como synced.
12. Se conflito, envia para Conflict Center.
13. Lock é liberado ao salvar/cancelar.
```

### 5.3 Sincronização

```text
1. Sync Engine lê Sync Queue.
2. Agrupa alterações por worksheet.
3. Para cada entidade, confirma versão local/remota.
4. Adquire locks necessários quando aplicável.
5. Converte entidades para rows.
6. Executa batch update no Google Sheets.
7. Atualiza __sync_log.
8. Atualiza __meta.updated_at.
9. Atualiza lastSyncedAt local.
10. Libera locks.
```

---

## 6. Estrutura de Pastas Recomendada

```text
financial-os/
  app/
    layout.tsx
    page.tsx
    globals.css

    (auth)/
      login/page.tsx

    (app)/
      dashboard/page.tsx
      data-studio/page.tsx
      income/page.tsx
      expenses/page.tsx
      properties/page.tsx
      properties/[id]/page.tsx
      loans/page.tsx
      investments/page.tsx
      retirement/page.tsx
      tax-planning/page.tsx
      scenarios/page.tsx
      scenarios/[id]/page.tsx
      projections/page.tsx
      sync/page.tsx
      settings/page.tsx

  components/
    ui/
    layout/
    charts/
    forms/
    data-entry/
    dashboards/
    locks/
    sync/
    properties/
    scenarios/

  features/
    auth/
    workbook/
    dashboard/
    data-studio/
    income/
    expenses/
    properties/
    loans/
    investments/
    retirement/
    tax-planning/
    scenarios/
    projections/
    sync/
    settings/

  domain/
    entities/
    value-objects/
    commands/
    events/
    engines/
      tax/
      real-estate/
      loans/
      net-worth/
      fire/
      retirement/
      scenarios/
    schemas/
    rules/

  infrastructure/
    google/
      google-auth.client.ts
      google-drive.client.ts
      google-sheets.client.ts
      google-api-types.ts
    db/
      dexie.ts
      repositories/
    sync/
      sync-engine.ts
      lock-manager.ts
      conflict-resolver.ts
      sheet-mapper.ts
      migrations/
    money/
      money.ts
    dates/
      date-utils.ts

  lib/
    env.ts
    constants.ts
    ids.ts
    logger.ts
    result.ts

  test/
    fixtures/
    unit/
    integration/

  docs/
    architecture.md
    google-sheets-schema.md
    sync-engine.md
```

---

## 7. Camadas

### 7.1 UI Layer

Responsável por:

- telas;
- componentes;
- formulários;
- gráficos;
- tabelas;
- navegação;
- feedback visual;
- estados de loading;
- erros;
- lock banners;
- sync status.

Não deve conter regras financeiras complexas.

### 7.2 Application Layer

Responsável por:

- orquestrar use cases;
- criar commands;
- chamar validações;
- persistir localmente;
- disparar sync;
- transformar entidades em view models.

### 7.3 Domain Layer

Responsável por:

- entidades;
- value objects;
- regras;
- engines de cálculo;
- validação de invariantes;
- simulações;
- projeções.

Não deve depender de React, Google APIs ou IndexedDB.

### 7.4 Infrastructure Layer

Responsável por:

- Dexie;
- Google APIs;
- sync;
- locks;
- migrations;
- serialização/deserialização;
- logs técnicos.

---

## 8. Autenticação Google

### 8.1 Estratégia

Usar Google Identity Services diretamente no browser.

### 8.2 Scopes sugeridos

Usar scopes mínimos:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/spreadsheets
```

Evitar no MVP:

```text
https://www.googleapis.com/auth/drive
```

### 8.3 Tokens

Como não há backend:

- guardar access token apenas em memória;
- não salvar refresh token;
- se expirar, pedir novo token;
- armazenar apenas dados não sensíveis localmente.

---

## 9. Google Workbook

### 9.1 Nome padrão

```text
Financial OS - Personal Workbook
```

ou:

```text
Financial OS - {Nome do Usuário}
```

### 9.2 Descoberta

1. Buscar arquivo Google Sheets criado pelo app.
2. Preferir `appProperties` quando possível.
3. Se não existir, criar workbook.
4. Garantir abas e headers.

### 9.3 App Properties

```json
{
  "app": "financial-os",
  "workbookType": "personal-finance",
  "schemaVersion": "3"
}
```

---

## 10. IndexedDB / Dexie

### 10.1 Schema Dexie

```ts
export class FinancialOsDb extends Dexie {
  metadata!: Table<LocalMetadata, string>;
  entities!: Table<LocalEntityRecord, string>;
  commands!: Table<CommandRecord, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  locks!: Table<LocalLockRecord, string>;
  conflicts!: Table<ConflictRecord, string>;
  snapshots!: Table<ProjectionSnapshot, string>;

  constructor() {
    super("financial_os");
    this.version(1).stores({
      metadata: "key",
      entities: "id, type, updatedAt, deletedAt, dirty",
      commands: "id, entityId, entityType, status, createdAt",
      syncQueue: "id, status, createdAt, entityType",
      locks: "resourceKey, expiresAt",
      conflicts: "id, status, createdAt",
      snapshots: "id, type, createdAt"
    });
  }
}
```

### 10.2 Registro genérico de entidade local

```ts
export interface LocalEntityRecord<T = unknown> {
  id: string;
  type: EntityType;
  version: number;
  data: T;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lastSyncedAt?: string | null;
  sheetRowNumber?: number | null;
  dirty: boolean;
}
```

---

## 11. Google Sheets — Modelo de Dados

### 11.1 Convenções

Todas as abas devem ter:

```text
id
version
created_at
updated_at
deleted_at
created_by
updated_by
```

Convenções:

- headers em `snake_case`;
- IDs em UUID;
- datas em ISO 8601;
- dinheiro em centavos de USD;
- percentuais em basis points;
- booleanos como TRUE/FALSE;
- soft delete com `deleted_at`;
- primeira linha sempre header;
- não depender de fórmulas para lógica do app.

### 11.2 Abas técnicas

#### `__meta`

| coluna | tipo | descrição |
|---|---|---|
| key | string | chave |
| value | string | valor |
| updated_at | datetime | última atualização |

Valores obrigatórios:

```text
schema_version = 3
app_name = Financial OS
workbook_id = {spreadsheet_id}
default_currency = USD
lock_ttl_seconds = 120
created_at = ISO_DATE
updated_at = ISO_DATE
```

#### `__locks`

| coluna | tipo | descrição |
|---|---|---|
| resource_key | string | ex: property:uuid |
| resource_type | string | tipo |
| resource_id | string | id da entidade |
| lock_token | string | token do lock |
| owner_user_id | string | Google sub |
| owner_email | string | email |
| owner_name | string | nome |
| owner_session_id | string | sessão local |
| acquired_at | datetime | início |
| heartbeat_at | datetime | último heartbeat |
| expires_at | datetime | expiração |
| status | string | active/released/expired |

#### `__sync_log`

| coluna | tipo |
|---|---|
| id | uuid |
| command_id | uuid |
| entity_type | string |
| entity_id | uuid |
| operation | string |
| payload_hash | string |
| user_email | string |
| client_created_at | datetime |
| synced_at | datetime |
| status | string |

#### `__schema_migrations`

| coluna | tipo |
|---|---|
| id | string |
| version | number |
| applied_at | datetime |
| applied_by | string |

### 11.3 Abas de domínio

#### `households`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| name | string |
| base_currency | string |
| country | string |
| state | string |
| city | string |
| filing_status | string |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `people`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| name | string |
| email | string |
| role | string |
| birth_year | number |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `income_sources`

| coluna | tipo | exemplo |
|---|---|---|
| id | uuid | |
| version | number | |
| household_id | uuid | |
| person_id | uuid | |
| name | string | W-2 Job |
| type | string | w2 / llc / rental / dividend / interest / other |
| annual_amount_cents | number | 15000000 |
| growth_rate_bps | number | 300 |
| start_date | date | |
| end_date | date | |
| tax_treatment | string | ordinary / qualified_dividend / capital_gain |
| active | boolean | TRUE |
| created_at | datetime | |
| updated_at | datetime | |
| deleted_at | datetime | |
| created_by | string | |
| updated_by | string | |

#### `expenses`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| name | string |
| category | string |
| monthly_amount_cents | number |
| inflation_rate_bps | number |
| start_date | date |
| end_date | date |
| is_discretionary | boolean |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `properties`

| coluna | tipo | exemplo |
|---|---|---|
| id | uuid | |
| version | number | |
| household_id | uuid | |
| name | string | Wellness Ridge Townhouse |
| property_type | string | townhouse / sfh / condo / multifamily |
| ownership_type | string | personal / llc |
| street | string | |
| city | string | Clermont |
| state | string | FL |
| zip | string | |
| purchase_date | date | |
| purchase_price_cents | number | 37000000 |
| current_value_cents | number | 38000000 |
| down_payment_cents | number | 7400000 |
| closing_costs_cents | number | |
| bedrooms | number | 3 |
| bathrooms | number | 2.5 |
| sqft | number | 1800 |
| year_built | number | 2026 |
| hoa_monthly_cents | number | |
| cdd_annual_cents | number | |
| property_tax_annual_cents | number | |
| insurance_annual_cents | number | |
| maintenance_annual_cents | number | |
| appreciation_rate_bps | number | 300 |
| rent_monthly_cents | number | 250000 |
| vacancy_rate_bps | number | 500 |
| management_fee_bps | number | 800 |
| status | string | prospect / owned / sold |
| notes | string | |
| created_at | datetime | |
| updated_at | datetime | |
| deleted_at | datetime | |
| created_by | string | |
| updated_by | string | |

#### `loans`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| property_id | uuid |
| lender | string |
| loan_type | string |
| original_balance_cents | number |
| current_balance_cents | number |
| interest_rate_bps | number |
| term_months | number |
| start_date | date |
| monthly_payment_cents | number |
| escrow_monthly_cents | number |
| extra_payment_monthly_cents | number |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `investment_accounts`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| name | string |
| account_type | string |
| institution | string |
| current_balance_cents | number |
| expected_return_bps | number |
| contribution_monthly_cents | number |
| tax_treatment | string |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `tax_strategies`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| year | number |
| name | string |
| strategy_type | string |
| estimated_deduction_cents | number |
| estimated_tax_savings_cents | number |
| status | string |
| risk_level | string |
| notes | string |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `tax_assumptions`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| year | number |
| filing_status | string |
| federal_effective_rate_bps | number |
| state_effective_rate_bps | number |
| self_employment_tax_rate_bps | number |
| fica_rate_bps | number |
| standard_deduction_cents | number |
| itemized_deduction_cents | number |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `scenarios`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| household_id | uuid |
| name | string |
| description | string |
| start_year | number |
| end_year | number |
| base_scenario_id | uuid |
| status | string |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `scenario_assumptions`

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| scenario_id | uuid |
| key | string |
| value | string |
| value_type | string |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

#### `projection_snapshots`

Persistir apenas snapshots explicitamente salvos pelo usuário.

| coluna | tipo |
|---|---|
| id | uuid |
| version | number |
| scenario_id | uuid |
| year | number |
| net_worth_cents | number |
| total_assets_cents | number |
| total_liabilities_cents | number |
| active_income_cents | number |
| passive_income_cents | number |
| estimated_tax_cents | number |
| investable_cashflow_cents | number |
| created_at | datetime |
| updated_at | datetime |
| deleted_at | datetime |
| created_by | string |
| updated_by | string |

---

## 12. Tipos e Value Objects

### 12.1 Dinheiro

Nunca usar decimal solto para dinheiro persistido.

```ts
export type MoneyCents = number;

export interface Money {
  cents: MoneyCents;
  currency: "USD";
}
```

### 12.2 Percentuais

```ts
// 100 bps = 1%
export type BasisPoints = number;
```

### 12.3 Property entity

```ts
export interface Property {
  id: string;
  version: number;
  householdId: string;
  name: string;
  propertyType: "townhouse" | "sfh" | "condo" | "multifamily";
  ownershipType: "personal" | "llc";
  city: string;
  state: string;
  purchasePriceCents: number;
  currentValueCents: number;
  downPaymentCents: number;
  rentMonthlyCents: number;
  hoaMonthlyCents: number;
  cddAnnualCents: number;
  propertyTaxAnnualCents: number;
  insuranceAnnualCents: number;
  maintenanceAnnualCents: number;
  appreciationRateBps: number;
  vacancyRateBps: number;
  managementFeeBps: number;
  status: "prospect" | "owned" | "sold";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
```

### 12.4 Zod schema obrigatório

Cada entidade deve ter schema Zod.

```ts
export const propertySchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  householdId: z.string().uuid(),
  name: z.string().min(1),
  propertyType: z.enum(["townhouse", "sfh", "condo", "multifamily"]),
  ownershipType: z.enum(["personal", "llc"]),
  city: z.string().min(1),
  state: z.string().min(1),
  purchasePriceCents: z.number().int().nonnegative(),
  currentValueCents: z.number().int().nonnegative(),
  downPaymentCents: z.number().int().nonnegative(),
  rentMonthlyCents: z.number().int().nonnegative(),
  hoaMonthlyCents: z.number().int().nonnegative(),
  cddAnnualCents: z.number().int().nonnegative(),
  propertyTaxAnnualCents: z.number().int().nonnegative(),
  insuranceAnnualCents: z.number().int().nonnegative(),
  maintenanceAnnualCents: z.number().int().nonnegative(),
  appreciationRateBps: z.number().int(),
  vacancyRateBps: z.number().int().min(0).max(10000),
  managementFeeBps: z.number().int().min(0).max(10000),
  status: z.enum(["prospect", "owned", "sold"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional()
});
```

---

## 13. Command Pattern

Toda mutação deve virar comando.

```ts
export interface Command<TPayload = unknown> {
  id: string;
  type: CommandType;
  entityType: EntityType;
  entityId: string;
  payload: TPayload;
  userId: string;
  userEmail: string;
  sessionId: string;
  createdAt: string;
  status: "pending" | "applied" | "syncing" | "synced" | "failed" | "conflict";
}
```

Tipos iniciais:

```ts
type CommandType =
  | "CreateIncomeSource"
  | "UpdateIncomeSource"
  | "DeleteIncomeSource"
  | "CreateExpense"
  | "UpdateExpense"
  | "DeleteExpense"
  | "CreateProperty"
  | "UpdateProperty"
  | "DeleteProperty"
  | "CreateLoan"
  | "UpdateLoan"
  | "DeleteLoan"
  | "CreateInvestmentAccount"
  | "UpdateInvestmentAccount"
  | "DeleteInvestmentAccount"
  | "CreateTaxStrategy"
  | "UpdateTaxStrategy"
  | "DeleteTaxStrategy"
  | "CreateScenario"
  | "UpdateScenario"
  | "DeleteScenario";
```

Benefícios:

- fila de sincronização;
- auditoria local;
- retry;
- undo/redo futuro;
- resolução de conflitos;
- testes mais simples.

---

## 14. Sync Engine

### 14.1 Responsabilidades

- processar Sync Queue;
- importar planilha para IndexedDB;
- exportar alterações locais para Google Sheets;
- agrupar batch updates;
- manter `__sync_log`;
- detectar conflitos;
- acionar Lock Manager;
- executar migrations;
- atualizar status global.

### 14.2 SyncQueueItem

```ts
export interface SyncQueueItem {
  id: string;
  commandId: string;
  entityType: EntityType;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  status: "pending" | "syncing" | "synced" | "failed" | "conflict";
  attempts: number;
  lastAttemptAt?: string;
  errorMessage?: string;
  createdAt: string;
}
```

### 14.3 Estados globais de sync

```ts
type SyncStatus =
  | "idle"
  | "dirty"
  | "syncing"
  | "synced"
  | "offline"
  | "failed"
  | "conflict";
```

### 14.4 Estratégia de escrita

Nunca escrever célula por célula.

Usar batch:

```text
1. Agrupar por worksheet.
2. Resolver row por id.
3. Creates viram append.
4. Updates substituem range da row.
5. Deletes preenchem deleted_at.
6. Atualizar __sync_log.
7. Atualizar __meta.updated_at.
```

### 14.5 Estratégia de leitura

```text
1. Ler __meta.
2. Ler todas as abas técnicas.
3. Ler todas as abas de domínio.
4. Validar cada row com Zod.
5. Converter rows para entidades.
6. Upsert em IndexedDB.
7. Marcar lastSyncedAt.
```

---

## 15. Controle de Lock

### 15.1 Objetivo

Evitar que duas sessões editem o mesmo recurso simultaneamente e sobrescrevam dados.

### 15.2 Tipo

Implementar **soft lock otimista** na aba `__locks`.

Como o Google Sheets não oferece transações fortes, o lock não é perfeito, mas é suficiente para MVP.

### 15.3 Resource keys

```text
property:{propertyId}
loan:{loanId}
income_source:{incomeSourceId}
expense:{expenseId}
investment_account:{accountId}
tax_strategy:{strategyId}
scenario:{scenarioId}
workbook:schema_migration
```

### 15.4 Aquisição

```text
1. Gerar lock_token UUID.
2. Ler __locks para resource_key.
3. Se não existir lock ativo, criar.
4. Se lock expirou, sobrescrever.
5. Se lock ativo é de outra sessão, abrir readonly.
6. Após escrever, reler row.
7. Confirmar que lock_token é seu.
8. Só então permitir edição.
```

### 15.5 Heartbeat

- renovar a cada 30 segundos;
- TTL padrão: 120 segundos;
- se renovação falhar, mostrar aviso.

### 15.6 Liberação

Ao salvar/cancelar:

- marcar status `released`;
- expirar `expires_at`;
- parar heartbeat.

### 15.7 UI

Se outro usuário estiver editando:

```text
Este item está sendo editado por Maria (maria@email.com).
Você pode visualizar, mas não editar. O lock expira em aproximadamente 2 minutos.
```

Se expirou:

```text
O lock anterior expirou. Você pode assumir a edição.
```

---

## 16. Conflitos

### 16.1 Quando ocorre conflito

Conflito ocorre se:

- entidade local está dirty;
- entidade remota tem version maior;
- `updated_at` remoto é posterior ao `lastSyncedAt` local.

### 16.2 Estratégia MVP

Tela de conflito com opções:

1. manter minha versão;
2. usar versão da planilha;
3. mesclar manualmente.

### 16.3 UI de merge

Comparar campo a campo:

| Campo | Minha versão | Versão remota |
|---|---:|---:|
| rent_monthly | $2,500 | $2,600 |
| hoa_monthly | $320 | $350 |

---

## 17. Data Studio — Área de Inputs Não-Planilha

### 17.1 Objetivo

Criar uma área chamada **Data Studio** onde o usuário informa e edita dados sem parecer que está manipulando planilhas.

### 17.2 Layout

```text
Data Studio

┌──────────────────────────────────────────────────────────┐
│ Status: 3 alterações locais pendentes      [Sync agora]  │
│ Último sync: há 2 minutos                                │
└──────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Renda         │ │ Imóveis       │ │ Investimentos │
│ 2 fontes      │ │ 3 ativos      │ │ 4 contas       │
│ [Editar]      │ │ [Editar]      │ │ [Editar]       │
└──────────────┘ └──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Despesas      │ │ Tax Planning  │ │ Cenários      │
│ 18 itens      │ │ 5 estratégias │ │ 3 simulações  │
│ [Editar]      │ │ [Editar]      │ │ [Editar]      │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 17.3 Experiência

Usar:

- cards;
- drawers;
- forms;
- steps;
- quick actions;
- preview de impacto;
- validação inline;
- toasts;
- sync status.

Não usar grid estilo Excel para input principal.

### 17.4 Exemplo: editar imóvel

```text
1. Usuário clica em Imóveis.
2. Abre lista visual de propriedades.
3. Usuário escolhe propriedade.
4. App adquire lock property:{id}.
5. Abre drawer com tabs:
   - Dados gerais
   - Compra
   - Aluguel
   - Custos
   - Financiamento
   - Projeções
6. Usuário altera valores.
7. App mostra preview:
   - cash flow mensal
   - cap rate
   - cash-on-cash
   - impacto em 10 anos
8. Usuário salva.
9. App grava localmente no Dexie.
10. App cria command.
11. App dispara sync.
```

### 17.5 Estados visuais obrigatórios

- Saved locally;
- Syncing;
- Synced;
- Offline;
- Conflict;
- Locked by another user;
- Validation error.

### 17.6 Autosave

Para MVP:

- salvar localmente automaticamente ou no submit;
- sincronizar remotamente em:
  - botão sync;
  - botão salvar e sincronizar;
  - navegação para fora;
  - intervalo periódico opcional.

Não sincronizar a cada keystroke.

---

## 18. Telas do Software

### 18.1 Login / Welcome

- hero;
- explicação do produto;
- botão Entrar com Google;
- aviso de privacidade: “Seus dados ficam no seu Google Drive”.

### 18.2 Onboarding

Passos:

1. conectar Google;
2. criar/localizar workbook;
3. criar household;
4. informar renda inicial;
5. informar patrimônio atual;
6. informar objetivos;
7. ir ao dashboard.

### 18.3 Dashboard

KPIs:

- patrimônio líquido;
- ativos totais;
- passivos totais;
- renda mensal;
- despesas mensais;
- fluxo de caixa investível;
- renda passiva;
- taxa de poupança;
- effective tax rate estimado;
- progresso para independência financeira.

Gráficos:

- patrimônio ao longo do tempo;
- alocação de ativos;
- dívida vs ativos;
- fluxo de caixa anual;
- renda ativa vs passiva.

### 18.4 Data Studio

Área principal de inputs e edição.

Módulos:

- renda;
- despesas;
- imóveis;
- empréstimos;
- investimentos;
- aposentadoria;
- impostos;
- cenários.

### 18.5 Income

Gerenciar:

- W-2;
- LLC;
- bônus;
- aluguel;
- dividendos;
- juros;
- outras rendas.

### 18.6 Expenses

Gerenciar:

- fixas;
- variáveis;
- discricionárias;
- empresariais;
- associadas a imóveis;
- impostos;
- seguros.

### 18.7 Properties

Funcionalidades:

- portfólio imobiliário;
- adicionar propriedade;
- comparar candidatos;
- cash flow;
- cap rate;
- cash-on-cash;
- DSCR;
- equity;
- valorização projetada;
- impacto tributário estimado.

### 18.8 Property Detail

Tabs:

- resumo;
- aquisição;
- financiamento;
- aluguel;
- custos;
- projeções;
- documentos;
- notas;
- sync/lock.

### 18.9 Loans

- hipotecas;
- amortização;
- extra payments;
- refinanciamento;
- payoff;
- impacto no cash flow.

### 18.10 Investments

- brokerage;
- retirement accounts;
- ETFs;
- cash;
- crypto opcional;
- allocation;
- expected return;
- contribution plan.

### 18.11 Retirement

- 401(k);
- Solo 401(k);
- IRA;
- HSA;
- Cash Balance Plan;
- projeções de aposentadoria;
- limites configuráveis manualmente.

### 18.12 Tax Planning

- estratégias fiscais;
- deduções estimadas;
- S-Corp;
- Solo 401(k);
- Cash Balance Plan;
- HSA;
- accountable plan;
- real estate depreciation;
- cost segregation;
- short-term rental;
- charitable giving;
- estimated tax savings.

Sempre mostrar disclaimer: não substitui CPA/EA/attorney.

### 18.13 Scenarios

Exemplos:

- comprar townhouse todo ano;
- comprar single-family a cada 2 anos;
- investir tudo em ETFs;
- crescer LLC para 300k;
- adicionar Cash Balance Plan;
- juros caem para 5%;
- aluguel cresce 4% ao ano;
- vender imóvel no ano 7.

### 18.14 Scenario Detail

Mostrar:

- inputs;
- premissas;
- gráfico de patrimônio;
- fluxo de caixa anual;
- impostos estimados;
- aquisições planejadas;
- comparação com cenário base.

### 18.15 Projections

Projeções de 10/20/30 anos:

- patrimônio;
- ativos;
- passivos;
- renda passiva;
- renda ativa;
- impostos estimados;
- cash flow;
- aporte anual;
- equity imobiliária.

### 18.16 Sync Center

Mostrar:

- status Google;
- workbook atual;
- último sync;
- alterações pendentes;
- conflitos;
- locks ativos;
- fila de comandos;
- logs recentes;
- botão Sync agora;
- botão reimportar da planilha;
- botão exportar backup JSON.

### 18.17 Settings

- household;
- moeda;
- cidade/estado;
- filing status;
- schema version;
- workbook link;
- sync preferences;
- lock timeout;
- backup/export.

---

## 19. Inteligência do Software

### 19.1 Inteligência determinística no MVP

Antes de IA generativa, implementar inteligência baseada em regras e cálculos.

Módulos:

1. Real Estate Analyzer;
2. Mortgage Analyzer;
3. Tax Strategy Estimator;
4. Net Worth Projection Engine;
5. FIRE Calculator;
6. Scenario Comparator;
7. Cash Flow Optimizer;
8. Risk Flags;
9. Data Quality Checker.

### 19.2 Real Estate Analyzer

Calcular:

- gross yield;
- NOI;
- cap rate;
- cash-on-cash;
- monthly cash flow;
- annual cash flow;
- equity growth;
- break-even rent;
- vacancy impact;
- HOA sensitivity;
- interest rate sensitivity.

Alertas:

```text
HOA acima de 12% do aluguel bruto. Verifique impacto no cash flow.

O imóvel depende fortemente de valorização para justificar a compra.

Cash flow negativo, mas pode fazer sentido se o objetivo for appreciation.
```

### 19.3 Tax Strategy Estimator

Calcular estimativas simplificadas:

- renda tributável;
- deduções;
- economia tributária;
- efeito de aposentadoria;
- efeito de S-Corp;
- efeito de estratégias imobiliárias.

O app não deve prometer precisão fiscal.

### 19.4 Scenario Comparator

Comparar cenários:

| Métrica | Cenário A | Cenário B | Diferença |
|---|---:|---:|---:|
| Patrimônio em 10 anos | $3.2M | $3.8M | +$600k |
| Renda passiva | $90k | $130k | +$40k |
| Imposto estimado | $420k | $360k | -$60k |

### 19.5 Data Quality Checker

Detectar:

- imóveis sem seguro;
- empréstimos sem taxa;
- renda sem crescimento;
- despesas sem categoria;
- propriedades com aluguel zero;
- HOA muito alta;
- dados faltantes;
- version mismatch;
- sync pendente antigo.

### 19.6 AI Layer futuro

Não implementar chamada real para LLM no MVP se isso exigir expor API key no browser.

Preparar interface:

```ts
export interface InsightProvider {
  generateInsights(input: FinancialContext): Promise<Insight[]>;
}
```

Implementar primeiro:

```text
RuleBasedInsightProvider
```

Futuro:

- backend opcional;
- Cloudflare Worker;
- BYO API key;
- local LLM;
- OpenAI/Anthropic via servidor seguro.

---

## 20. Engines de Cálculo

### 20.1 Mortgage Engine

```ts
calculateMonthlyPayment(input): Money;
calculateAmortizationSchedule(input): AmortizationRow[];
calculateRemainingBalance(input, asOfDate): Money;
calculateRefinanceImpact(input): RefinanceResult;
```

### 20.2 Real Estate Engine

```ts
calculateGrossYield(property): number;
calculateNoi(property): Money;
calculateCapRate(property): number;
calculateCashOnCash(property, loan): number;
calculateMonthlyCashFlow(property, loan): Money;
calculateBreakEvenRent(property, loan): Money;
```

### 20.3 Net Worth Engine

```ts
calculateAssets(context): Money;
calculateLiabilities(context): Money;
calculateNetWorth(context): Money;
projectNetWorth(context, assumptions): Projection[];
```

### 20.4 Scenario Engine

```ts
runScenario(baseContext, scenario): ScenarioResult;
compareScenarios(results): ScenarioComparison;
```

### 20.5 Tax Estimate Engine

```ts
estimateEffectiveTaxRate(input): BasisPoints;
estimateTaxSavings(strategy): Money;
estimateTaxableIncome(context): Money;
```

---

## 21. UI/UX Guidelines

### 21.1 Direção visual

A interface deve parecer:

- moderna;
- profissional;
- limpa;
- estilo Linear/Vercel/Notion/Cursor;
- sem aparência de planilha antiga.

### 21.2 Componentes shadcn/ui

Usar:

- Button;
- Card;
- Dialog;
- Sheet;
- Drawer;
- Tabs;
- Table;
- Badge;
- Alert;
- Form;
- Input;
- Select;
- Command;
- DropdownMenu;
- Toast/Sonner;
- Skeleton;
- Progress.

### 21.3 Formulários

- React Hook Form + Zod ou TanStack Form + Zod;
- validação inline;
- campos monetários formatados;
- percentuais amigáveis;
- converter dólares visuais para cents no submit;
- converter percentuais visuais para bps no submit.

Botões:

- Cancelar;
- Salvar localmente;
- Salvar e sincronizar.

### 21.4 Tabelas

Usar TanStack Table para visualização estruturada, não para simular Excel.

Recursos:

- sorting;
- filtering;
- column visibility;
- row actions;
- virtualização.

---

## 22. Estado Global

### 22.1 Zustand Stores

Criar:

```text
authStore
workbookStore
syncStore
lockStore
uiStore
```

### 22.2 TanStack Query

Usar para:

- cache de leituras locais;
- queries derivadas;
- invalidation após commands;
- estados assíncronos;
- carregamentos.

Fonte local principal: Dexie.  
Fonte remota: Google Sheets via Sync Engine.

### 22.3 Barra global de status

Mostrar:

- online/offline;
- synced/dirty/syncing/conflict;
- último sync;
- botão Sync.

---

## 23. Deployment

### 23.1 GitHub Pages

Pipeline:

```text
push main
  ↓
GitHub Actions
  ↓
npm ci
  ↓
npm run build
  ↓
publish out/
```

### 23.2 Cloudflare Pages

Também recomendado:

- deploy preview;
- custom domain;
- performance global;
- caminho futuro para Cloudflare Workers se necessário.

### 23.3 Variáveis públicas

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_DEFAULT_SCHEMA_VERSION
```

Não colocar secrets.

---

## 24. Segurança

### 24.1 Regras

- nunca colocar API secret no app;
- não salvar access token permanentemente;
- usar scopes mínimos;
- sanitizar inputs;
- validar rows importadas;
- não executar conteúdo vindo da planilha;
- evitar `dangerouslySetInnerHTML`;
- CSP futura se hospedagem permitir.

### 24.2 Client-side encryption futuro

Opcional:

- Web Crypto API;
- passphrase do usuário;
- criptografar abas sensíveis antes de enviar ao Sheets.

Não implementar no MVP, a menos que seja simples.

---

## 25. Schema Migrations

### 25.1 Fluxo

```text
1. Ler __meta.schema_version.
2. Comparar com APP_SCHEMA_VERSION.
3. Se menor, adquirir lock workbook:schema_migration.
4. Executar migrations sequenciais.
5. Registrar em __schema_migrations.
6. Atualizar __meta.schema_version.
7. Liberar lock.
```

### 25.2 Interface

```ts
export interface SchemaMigration {
  version: number;
  name: string;
  up(context: MigrationContext): Promise<void>;
}
```

---

## 26. Testes

### 26.1 Unit tests

Testar:

- money utils;
- percentuais;
- mortgage engine;
- real estate engine;
- net worth engine;
- tax estimator;
- Zod schemas;
- mappers Sheets <-> Domain.

### 26.2 Component tests

Testar:

- forms;
- cards;
- lock banner;
- conflict resolver;
- Data Studio.

### 26.3 E2E

Fluxos:

- login mockado;
- criar workbook fake;
- criar imóvel;
- editar imóvel;
- sincronizar;
- conflito;
- lock ativo.

### 26.4 Mocks

Criar:

```text
MockGoogleDriveClient
MockGoogleSheetsClient
MockAuthClient
```

---

## 27. Critérios de Aceite do MVP

### 27.1 Auth

- login Google funciona;
- token em memória;
- usuário autenticado visível;
- logout limpa estado sensível.

### 27.2 Workbook

- cria workbook se não existir;
- localiza workbook existente;
- cria abas necessárias;
- valida schema.

### 27.3 Local DB

- importa dados para Dexie;
- app funciona após refresh;
- alterações locais persistem offline.

### 27.4 Data Studio

Usuário consegue criar/editar:

- renda;
- despesa;
- imóvel;
- empréstimo;
- investimento;
- cenário.

### 27.5 Sync

- alteração local entra na fila;
- Sync grava no Sheets;
- falhas aparecem;
- retry funciona.

### 27.6 Lock

- abrir edição cria lock;
- outra sessão vê bloqueio;
- lock expira;
- heartbeat renova;
- salvar/cancelar libera.

### 27.7 Cálculos

- dashboard mostra patrimônio líquido;
- property detail mostra cash flow;
- scenario detail mostra projeção;
- tax planning mostra estimativas.

---

## 28. Roadmap Técnico

### Fase 1 — Foundation

- Next.js static export;
- Tailwind;
- shadcn/ui;
- layout;
- routing;
- Zustand;
- Dexie;
- Google auth mock;
- design system inicial.

### Fase 2 — Google Integration

- Google Identity Services;
- Drive client;
- Sheets client;
- workbook discovery;
- workbook creation;
- sheet creation;
- read/write básico.

### Fase 3 — Local DB + Sync

- Dexie schema;
- repositories;
- command queue;
- sync queue;
- batch writes;
- sync center.

### Fase 4 — Domain MVP

- Income;
- Expenses;
- Properties;
- Loans;
- Investments;
- Scenarios.

### Fase 5 — Engines

- mortgage engine;
- real estate engine;
- net worth engine;
- scenario engine;
- tax estimator.

### Fase 6 — Locks + Conflicts

- `__locks`;
- Lock Manager;
- heartbeat;
- conflict detection;
- conflict resolution UI.

### Fase 7 — UX Polish

- Data Studio;
- charts;
- empty states;
- onboarding;
- responsive layout;
- toasts;
- loading states.

### Fase 8 — AI-ready Layer

- RuleBasedInsightProvider;
- InsightProvider interface;
- future AI adapter;
- summaries locais baseados em templates.

---

## 29. Regras para Claude Code

Ao desenvolver este projeto:

1. Não criar backend.
2. Não criar API route.
3. Não usar server action.
4. Não adicionar Firebase/Supabase.
5. Não colocar secrets no frontend.
6. Manter domínio separado da UI.
7. Criar schemas Zod para todas as entidades.
8. Usar centavos para dinheiro.
9. Usar basis points para percentuais.
10. Toda mutação deve passar por command.
11. Toda alteração deve salvar no Dexie antes do Google Sheets.
12. Google Sheets é sincronização/persistência, não runtime database.
13. Implementar locks antes de permitir edição concorrente.
14. A UI de input deve parecer software, não planilha.
15. Priorizar código simples, modular e testável.
16. Adicionar testes para engines de cálculo.
17. Documentar decisões em `docs/architecture.md`.

---

## 30. Prompts sugeridos para Claude Code

### Prompt 1 — Foundation

```text
Crie um projeto Next.js 15 com TypeScript, Tailwind, shadcn/ui, Zustand, TanStack Query, Zod, Dexie e Vitest.

O projeto deve ser uma SPA estática usando output: "export", sem backend, sem API routes e sem server actions.

Implemente:
- estrutura de pastas;
- layout principal;
- rotas principais;
- Dexie database;
- tipos base;
- money utilities;
- Zod schemas iniciais;
- command model;
- sync queue model;
- stores globais;
- tela Dashboard placeholder;
- tela Data Studio placeholder;
- tela Sync Center placeholder.

Não implemente Google APIs ainda. Crie interfaces e mocks para GoogleDriveClient e GoogleSheetsClient.
```

### Prompt 2 — Modelo de dados

```text
Implemente o modelo de dados inicial:
- households
- people
- income_sources
- expenses
- properties
- loans
- investment_accounts
- tax_strategies
- scenarios
- scenario_assumptions

Para cada entidade:
- TypeScript interface;
- Zod schema;
- mapper para Google Sheets row;
- repository Dexie;
- commands create/update/delete;
- testes unitários dos schemas e mappers.
```

### Prompt 3 — Data Studio

```text
Implemente o Data Studio:
- cards para cada módulo;
- lista visual de entidades;
- drawer de edição para Properties;
- formulário de Property com React Hook Form + Zod;
- conversão entre dólares visuais e cents internos;
- criação de command;
- persistência local no Dexie;
- inclusão na sync queue;
- status visual de dirty/synced.
```

### Prompt 4 — Sync Engine

```text
Implemente o Sync Engine:
- interfaces GoogleSheetsClient e GoogleDriveClient;
- MockGoogleSheetsClient para testes;
- SheetMapper;
- SyncQueueProcessor;
- batch write planejado;
- __sync_log;
- importação de rows para IndexedDB;
- status global de sincronização.
```

### Prompt 5 — Lock Manager

```text
Implemente o Lock Manager:
- modelo __locks;
- aquisição de lock por resource_key;
- heartbeat;
- release;
- expiração;
- UI LockBanner;
- modo readonly quando outro usuário está editando;
- testes unitários do algoritmo de lock.
```

---

## 31. Observações Finais

A fronteira mais importante do sistema é:

```text
UI → Application → Domain → Dexie → Sync Engine → Google Sheets
```

O Google Sheets não deve ditar a arquitetura interna. Ele é apenas o formato externo de persistência.

O IndexedDB é o banco operacional.

O Sync Engine é a camada que permitirá trocar Google Sheets por backend próprio no futuro sem reescrever o produto inteiro.

O MVP deve provar que é possível entregar experiência de software profissional usando planilhas apenas como armazenamento transparente e controlado pelo usuário.
