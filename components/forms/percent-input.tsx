"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parsePercentToBps } from "@/domain/value-objects/basis-points";

export interface PercentInputProps {
  /** value in integer basis points (100 bps = 1%) */
  value: number;
  onChange: (bps: number) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function bpsToEditable(bps: number): string {
  if (!bps) return "";
  return (bps / 100).toString();
}

/** Percent input that emits integer basis points. */
export function PercentInput({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "0.00",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: PercentInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => bpsToEditable(value));

  useEffect(() => {
    if (!focused) setText(bpsToEditable(value));
  }, [value, focused]);

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="decimal"
        className="pr-7 tabular-nums"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parsePercentToBps(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}
