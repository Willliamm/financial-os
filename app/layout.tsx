import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Financial OS",
  description:
    "Advanced personal financial planning — net worth, real estate, taxes, and long-term projections. Your data stays in your own Google Drive.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Financial OS", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
