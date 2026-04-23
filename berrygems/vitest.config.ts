import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/lib/**/*.test.ts", "tests/extensions/**/*.test.ts"],
    experimental: {
      viteModuleRunner: false,
    },
    globals: false,
  },
});
