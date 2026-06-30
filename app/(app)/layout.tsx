import { AppShell } from "@/components/layout/app-shell";
import { AppProviders } from "@/components/app-providers";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
