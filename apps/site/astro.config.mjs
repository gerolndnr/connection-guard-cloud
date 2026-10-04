import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: "https://connectionguard.net",
  trailingSlash: "never",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Neutral chunk names: content blockers match file names like "posthog-recorder".
    build: { rollupOptions: { output: { chunkFileNames: "_astro/[hash].js" } } },
    // The dashboard preview uses the real dashboard components.
    resolve: { alias: { "@web": fileURLToPath(new URL("../web/src", import.meta.url)) } },
  },
});
