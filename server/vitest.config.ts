import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globalSetup: "./test/setup.ts",
  },
});
