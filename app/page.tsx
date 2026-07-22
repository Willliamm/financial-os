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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);

  useEffect(() => {
    if (status === "signed_in") router.replace("/dashboard");
  }, [status, router]);

  const signingIn = status === "signing_in";
  const restoring = status === "restoring";
  // A remembered profile that is not yet signed in → offer one-click return.
  const returningUser = user && status !== "signed_in" ? user : null;

  // While a silent session restore is in flight, hold a plain loader instead of
  // flashing the login form (we may be about to redirect straight to the app).
  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          {returningUser ? (
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={signingIn}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              <Avatar size="lg">
                {returningUser.picture ? (
                  <AvatarImage
                    src={returningUser.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback>
                  {(returningUser.name || returningUser.email || "?")
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {returningUser.name || returningUser.email}
                </p>
                {returningUser.email ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {returningUser.email}
                  </p>
                ) : null}
              </div>
              {signingIn ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
            </button>
          ) : null}

          <Button size="lg" onClick={() => void signIn()} disabled={signingIn}>
            {signingIn ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {signingIn
              ? t("auth:cta.connecting")
              : returningUser
                ? t("auth:cta.continueAs", {
                    name: returningUser.name || returningUser.email,
                  })
                : t("auth:cta.continue")}
          </Button>
          {returningUser && !signingIn ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void signIn({ selectAccount: true })}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {t("auth:cta.differentAccount")}
              </button>
            </div>
          ) : null}
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
