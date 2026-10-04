import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8788", changeOrigin: false } },
  },
  build: {
    sourcemap: true,
    // Neutral chunk names: content blockers match file names like "posthog-recorder".
    rollupOptions: { output: { chunkFileNames: "assets/[hash].js" } },
  },
});
