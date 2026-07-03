import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: React.ReactNode;
}

const TONE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function KpiCard({ label, value, sub, tone = "default", icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {label}
          </p>
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
        </div>
        <p
          title={value}
          className={cn(
            "mt-2 text-xl font-semibold tabular-nums break-words sm:text-2xl",
            TONE[tone],
          )}
        >
          {value}
        </p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
