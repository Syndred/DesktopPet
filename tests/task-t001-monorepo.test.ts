import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createPcBootstrapState } from "@qingpet/pc-app";
import { validateBattleTurnPayload } from "@qingpet/supabase-edge";
import {
  SHARED_SCHEMA_VERSION,
  toActionLabel
} from "@qingpet/shared-types";

describe("T-001 monorepo baseline", () => {
  it("has required workspace directories", () => {
    const root = process.cwd();
    const requiredPaths = [
      "apps/pc-app",
      "apps/mobile-app",
      "apps/supabase-edge",
      "packages/shared-types",
      "docs"
    ];

    requiredPaths.forEach((relativePath) => {
      expect(existsSync(join(root, relativePath))).toBe(true);
    });
  });

  it("wires shared types across packages", () => {
    const bootstrap = createPcBootstrapState("windows");

    expect(bootstrap.schemaVersion).toBe(SHARED_SCHEMA_VERSION);
    expect(toActionLabel("element_attack")).toBe("Element Attack");
    expect(
      validateBattleTurnPayload({
        attackerId: "u1",
        defenderId: "u2",
        attackerElement: "fire",
        defenderElement: "metal",
        action: "normal_attack"
      })
    ).toBe(true);
  });

  it("contains mandatory environment keys in template", () => {
    const envTemplate = readFileSync(
      join(process.cwd(), ".env.example"),
      "utf8"
    );

    expect(envTemplate).toContain("SUPABASE_URL=");
    expect(envTemplate).toContain("SUPABASE_ANON_KEY=");
    expect(envTemplate).toContain("TENCENT_MAP_KEY=");
    expect(envTemplate).toContain("GOOGLE_MAPS_KEY=");
  });
});

