"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./messages/en-US/common.json";
import enNav from "./messages/en-US/nav.json";
import enAuth from "./messages/en-US/auth.json";
import enDashboard from "./messages/en-US/dashboard.json";
import enDataStudio from "./messages/en-US/dataStudio.json";
import enIncome from "./messages/en-US/income.json";
import enExpenses from "./messages/en-US/expenses.json";
import enProperties from "./messages/en-US/properties.json";
import enLoans from "./messages/en-US/loans.json";
import enInvestments from "./messages/en-US/investments.json";
import enRetirement from "./messages/en-US/retirement.json";
import enTaxPlanning from "./messages/en-US/taxPlanning.json";
import enScenarios from "./messages/en-US/scenarios.json";
import enProjections from "./messages/en-US/projections.json";
import enSync from "./messages/en-US/sync.json";
import enSettings from "./messages/en-US/settings.json";
import enForms from "./messages/en-US/forms.json";
import enEntities from "./messages/en-US/entities.json";

import ptCommon from "./messages/pt-BR/common.json";
import ptNav from "./messages/pt-BR/nav.json";
import ptAuth from "./messages/pt-BR/auth.json";
import ptDashboard from "./messages/pt-BR/dashboard.json";
import ptDataStudio from "./messages/pt-BR/dataStudio.json";
import ptIncome from "./messages/pt-BR/income.json";
import ptExpenses from "./messages/pt-BR/expenses.json";
import ptProperties from "./messages/pt-BR/properties.json";
import ptLoans from "./messages/pt-BR/loans.json";
import ptInvestments from "./messages/pt-BR/investments.json";
import ptRetirement from "./messages/pt-BR/retirement.json";
import ptTaxPlanning from "./messages/pt-BR/taxPlanning.json";
import ptScenarios from "./messages/pt-BR/scenarios.json";
import ptProjections from "./messages/pt-BR/projections.json";
import ptSync from "./messages/pt-BR/sync.json";
import ptSettings from "./messages/pt-BR/settings.json";
import ptForms from "./messages/pt-BR/forms.json";
import ptEntities from "./messages/pt-BR/entities.json";

export const SUPPORTED_LOCALES = ["en-US", "pt-BR"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en-US";

export const NAMESPACES = [
  "common",
  "nav",
  "auth",
  "dashboard",
  "dataStudio",
  "income",
  "expenses",
  "properties",
  "loans",
  "investments",
  "retirement",
  "taxPlanning",
  "scenarios",
  "projections",
  "sync",
  "settings",
  "forms",
  "entities",
] as const;

const resources = {
  "en-US": {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    dashboard: enDashboard,
    dataStudio: enDataStudio,
    income: enIncome,
    expenses: enExpenses,
    properties: enProperties,
    loans: enLoans,
    investments: enInvestments,
    retirement: enRetirement,
    taxPlanning: enTaxPlanning,
    scenarios: enScenarios,
    projections: enProjections,
    sync: enSync,
    settings: enSettings,
    forms: enForms,
    entities: enEntities,
  },
  "pt-BR": {
    common: ptCommon,
    nav: ptNav,
    auth: ptAuth,
    dashboard: ptDashboard,
    dataStudio: ptDataStudio,
    income: ptIncome,
    expenses: ptExpenses,
    properties: ptProperties,
    loans: ptLoans,
    investments: ptInvestments,
    retirement: ptRetirement,
    taxPlanning: ptTaxPlanning,
    scenarios: ptScenarios,
    projections: ptProjections,
    sync: ptSync,
    settings: ptSettings,
    forms: ptForms,
    entities: ptEntities,
  },
} as const;

export const LANG_STORAGE_KEY = "fos.lang";

/** Detect the initial locale: stored choice → browser language → default. */
function detectInitialLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as AppLocale;
    }
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("pt")) return "pt-BR";
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: detectInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
