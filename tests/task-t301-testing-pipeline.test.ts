import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("T-301 testing pipeline", () => {
  it("defines layered test scripts in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["test:unit"]).toBeDefined();
    expect(pkg.scripts["test:integration"]).toBeDefined();
    expect(pkg.scripts["test:e2e"]).toBeDefined();
    expect(pkg.scripts["test:performance"]).toBeDefined();
    expect(pkg.scripts["test:security"]).toBeDefined();
    expect(pkg.scripts["test:coverage"]).toBeDefined();
    expect(pkg.scripts.verify).toContain("test:layers");
  });

  it("configures coverage thresholds in vitest config", () => {
    const config = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
    expect(config).toContain("thresholds");
    expect(config).toContain("statements: 70");
    expect(config).toContain("lines: 70");
    expect(config).toContain("functions: 70");
    expect(config).toContain("branches: 60");
  });

  it("contains ci quality gates workflow", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/quality-gates.yml"),
      "utf8"
    );
    expect(workflow).toContain("static-checks");
    expect(workflow).toContain("layered-tests");
    expect(workflow).toContain("coverage-gate");
    expect(workflow).toContain("npm run test:integration");
    expect(workflow).toContain("npm run test:security");
  });
});

