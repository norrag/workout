import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Write-pipeline integration tests (R21). Like the RLS suite these require a
 * running local Supabase stack (`supabase start`, migrations + seed applied) —
 * CI runs them in the rls-tests job after the policy suite; they are excluded
 * from the unit run. Unlike the RLS suite they exercise the QUERY LAYER
 * (`src/lib/queries/*`) end to end, so the module aliases mirror the unit
 * config (`server-only` stubbed) and `tests/integration/setup.ts` supplies
 * local-stack env defaults for the service client.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
