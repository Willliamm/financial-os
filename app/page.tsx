"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Building2,
  LineChart,
  Loader2,
  Lock,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/stores/auth-store";
import { env } from "@/lib/env";

const FEATURES = [
  { icon: Wallet, key: "netWorth" },
  { icon: Building2, key: "realEstate" },
  { icon: ReceiptText, key: "taxPlanning" },
  { icon: LineChart, key: "projections" },
] as const;

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);

  useEffect(() => {
    if (status === "signed_in") router.replace("/dashboard");
  }, [status, router]);

  const signingIn = status === "signing_in";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center gap-8 p-8 sm:p-16">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-5" />
          </div>
          <span className="text-lg font-semibold">Financial OS</span>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("auth:hero.title")}
          </h1>
          <p className="max-w-md text-muted-foreground">
            {t("auth:hero.subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          <Button size="lg" onClick={() => void signIn()} disabled={signingIn}>
            {signingIn ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {signingIn ? t("auth:cta.connecting") : t("auth:cta.continue")}
          </Button>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            {t("auth:privacy")}
          </p>
          {env.useMockGoogle ? (
            <p className="text-xs text-muted-foreground">
              {t("auth:demoMode")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden flex-col justify-center gap-4 bg-muted/40 p-16 lg:flex">
        <div className="grid grid-cols-2 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.key}>
                <CardContent className="space-y-2 p-5">
                  <Icon className="size-5 text-primary" />
                  <p className="font-medium">{t(`auth:features.${f.key}.title`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`auth:features.${f.key}.text`)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
