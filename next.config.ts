import type { NextConfig } from "next";

/**
 * Financial OS is a fully static, offline-first SPA.
 * No backend, no API routes, no server actions.
 * Data lives in IndexedDB locally and Google Sheets remotely.
 */
// For GitHub Pages *project* sites the app is served under /<repo>. Set
// NEXT_PUBLIC_BASE_PATH (e.g. "/financial-os") at build time. Leave empty for
// root deploys (Cloudflare Pages, Netlify, user/org pages, custom domains).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
  // The app is a client-side SPA; do not fail the static build on lint/type
  // issues in non-critical files. Types are still checked via `npm run typecheck`.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Tree-shake barrel imports from these packages (shadcn imports Radix via the
  // `radix-ui` meta-package), trimming the heavier CRUD/detail routes.
  experimental: {
    optimizePackageImports: ["radix-ui", "lucide-react", "date-fns"],
  },
  // In dev, keep the file watcher off non-source folders. Test/screenshot tools
  // (e.g. Playwright) write into the project tree; without this the watcher
  // rebuilds on every written log line, which can spiral into a rebuild loop.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/out/**",
          "**/.playwright-mcp/**",
          "**/test-results/**",
          "**/playwright-report/**",
          "**/coverage/**",
          "**/*.png",
          "**/*.jpeg",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
