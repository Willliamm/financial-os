"use client";

import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { LOCALE_LABELS, useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

/**
 * Language selector. Switching calls i18next's `changeLanguage`, which
 * re-renders every translated component without a page reload, and the language
 * detector persists the choice to localStorage.
 */
export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { i18n } = useTranslation();
  const locale = useLocale();

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        try {
          window.localStorage.setItem("fos.lang", value);
        } catch {
          /* ignore */
        }
        void i18n.changeLanguage(value);
      }}
    >
      <SelectTrigger
        aria-label="Language"
        className={cn(compact ? "h-9 w-auto gap-2" : "w-full", className)}
      >
        <Languages className="size-4 shrink-0 text-muted-foreground" />
        {compact ? null : <SelectValue />}
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
