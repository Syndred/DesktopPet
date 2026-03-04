import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/task-*.test.ts", "tests/unit/**/*.test.ts"]
  }
});

