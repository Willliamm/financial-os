"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatShares,
  parseSharesToMicros,
} from "@/domain/value-objects/shares";

export interface SharesInputProps {
  /** value in integer share micros */
  value: number;
  onChange: (micros: number) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Share-denominated input that emits integer micros. */
export function SharesInput({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "0",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: SharesInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (value ? formatShares(value) : ""));

  useEffect(() => {
    if (!focused) setText(value ? formatShares(value) : "");
  }, [value, focused]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      className={cn("tabular-nums", className)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
      placeholder={placeholder}
      value={focused ? text : value ? formatShares(value) : ""}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseSharesToMicros(e.target.value));
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
    />
  );
}
