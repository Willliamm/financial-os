"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseDollarsToCents } from "@/infrastructure/money/money";

export interface MoneyInputProps {
  /** value in integer cents */
  value: number;
  onChange: (cents: number) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function centsToEditable(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toString();
}

function centsToDisplay(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Dollar-denominated input that emits integer cents. */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "0.00",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => centsToEditable(value));

  useEffect(() => {
    if (!focused) setText(centsToEditable(value));
  }, [value, focused]);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        className="pl-7 tabular-nums"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        placeholder={placeholder}
        value={focused ? text : centsToDisplay(value)}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseDollarsToCents(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />
    </div>
  );
}
