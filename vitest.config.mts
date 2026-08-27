import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["node_modules", "e2e/**", "src/test/integration/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Ver src/test/stubs/server-only.ts: fronteira do bundler do Next que
      // não existe dentro do Vitest.
      "server-only": path.resolve(import.meta.dirname, "./src/test/stubs/server-only.ts"),
    },
  },
});
