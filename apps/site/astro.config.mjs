import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// /benchmark stays out of the sitemap until BENCHMARK_LIVE (src/data/release.ts) is switched on.
const benchmarkLive = /BENCHMARK_LIVE = true/.test(readFileSync(new URL("./src/data/release.ts", import.meta.url), "utf8"));

export default defineConfig({
  site: "https://connectionguard.net",
  trailingSlash: "never",
  integrations: [react(), sitemap({ filter: (page) => benchmarkLive || !page.includes("/benchmark") })],
  vite: {
    plugins: [tailwindcss()],
    // Neutral chunk names: content blockers match file names like "posthog-recorder".
    build: { rollupOptions: { output: { chunkFileNames: "_astro/[hash].js" } } },
    // The dashboard preview uses the real dashboard components.
    resolve: { alias: { "@web": fileURLToPath(new URL("../web/src", import.meta.url)) } },
  },
});
