"use client";

import { useTranslation } from "react-i18next";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale,
} from "./config";

/** The active app locale, narrowed to a supported value. */
export function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? "";
  return (SUPPORTED_LOCALES as readonly string[]).includes(lng)
    ? (lng as AppLocale)
    : DEFAULT_LOCALE;
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "en-US": "English (US)",
  "pt-BR": "Português (Brasil)",
};
