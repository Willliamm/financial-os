"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Menu, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SyncStatusPill, SyncNowButton } from "@/components/sync/sync-status";
import { cn } from "@/lib/utils";
import { AUTO_SYNC_INTERVAL_MS } from "@/lib/constants";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useWorkbookStore } from "@/lib/stores/workbook-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import { invalidateFinancialData } from "@/lib/queries/financial-data";
import { BRAND_ICON, NAV_GROUPS } from "./nav-config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const workbookStatus = useWorkbookStore((s) => s.status);
  const workbookStep = useWorkbookStore((s) => s.step);
  const workbookError = useWorkbookStore((s) => s.error);
  const initWorkbook = useWorkbookStore((s) => s.init);

  const online = useSyncStore((s) => s.online);
  const pending = useSyncStore((s) => s.pendingCount);
  const sync = useSyncStore((s) => s.sync);
  const queryClient = useQueryClient();

  // Auth gate: bounce to login if there is no in-memory session.
  useEffect(() => {
    if (authStatus === "signed_out") {
      router.replace("/");
    }
  }, [authStatus, router]);

  // Bootstrap the workbook once signed in.
  useEffect(() => {
    if (authStatus === "signed_in" && workbookStatus === "uninitialized") {
      void initWorkbook();
    }
  }, [authStatus, workbookStatus, initWorkbook]);

  // After the workbook is ready (imported + seeded), refresh cached reads once
  // so screens reflect the freshly loaded data.
  useEffect(() => {
    if (workbookStatus === "ready") {
      void invalidateFinancialData(queryClient);
    }
  }, [workbookStatus, queryClient]);

  // Periodic background sync of local changes.
  useEffect(() => {
    const timer = setInterval(() => {
      const autoSyncOn =
        typeof window !== "undefined" &&
        localStorage.getItem("fos_auto_sync") !== "false";
      if (autoSyncOn && online && pending > 0) void sync();
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [online, pending, sync]);

  if (authStatus !== "signed_in") {
    return <FullScreenLoader label={t("common:status.redirecting")} />;
  }

  if (workbookStatus === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-medium">{t("common:workbookError.title")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{workbookError}</p>
        <Button onClick={() => void initWorkbook()}>{t("common:actions.tryAgain")}</Button>
      </div>
    );
  }

  // Render the chrome immediately. Only the main content waits for the workbook
  // bootstrap, so the app never shows a blank full-screen loader.
  const booting = workbookStatus !== "ready";

  return (
    <div className="flex min-h-screen w-full">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <MobileSidebar />
          <div className="flex-1" />
          <SyncStatusPill />
          <SyncNowButton />
          <ThemeToggle />
          <UserMenu name={user?.name ?? "You"} email={user?.email ?? ""} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {booting ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {workbookStep || t("common:status.loadingData")}
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`nav:groups.${group.label}`)}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <NavItemIcon icon={item.icon} />
                  {t(`nav:items.${item.label}`)}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Swaps the nav item's icon for a spinner while its link navigation is in
 * flight — but only once the navigation has been pending for more than a
 * second, so fast (already-prefetched) navigations never flicker a spinner.
 */
function NavItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!pending) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), 1000);
    return () => clearTimeout(timer);
  }, [pending]);

  if (showSpinner) return <Loader2 className="size-4 animate-spin" />;
  return <Icon className="size-4" />;
}

function Brand() {
  const { t } = useTranslation();
  const Icon = BRAND_ICON;
  return (
    <div className="flex items-center gap-2 px-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Financial OS</p>
        <p className="text-[11px] text-muted-foreground">{t("nav:brandSubtitle")}</p>
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r lg:block">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-14 items-center border-b">
          <Brand />
        </div>
        <ScrollArea className="flex-1 px-3 py-4">
          <NavLinks />
        </ScrollArea>
      </div>
    </aside>
  );
}

function MobileSidebar() {
  const { t } = useTranslation();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t("nav:openMenu")}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">{t("common:navigation")}</SheetTitle>
        <div className="flex h-14 items-center border-b">
          <Brand />
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)] px-3 py-4">
          <NavLinks />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("common:toggleTheme")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          <LogOut className="size-4" />
          {t("common:actions.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
