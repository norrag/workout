import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when imported outside a server bundle; stub it so
      // server-tagged modules (e.g. the MCP layer) are unit-testable.
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
