import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

function runReleaseCommand(command: string, env: Record<string, string>): void {
  execSync(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    stdio: "pipe"
  });
}

describe("T-302 release pipeline and rollback", () => {
  it("runs release rehearsal and rollback rehearsal", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "qp-release-"));
    const env = {
      ROOT_DIR: process.cwd(),
      ARTIFACTS_DIR: join(sandbox, "artifacts"),
      RELEASES_DIR: join(sandbox, "releases"),
      STATE_DIR: join(sandbox, "release-state")
    };

    try {
      runReleaseCommand("node scripts/release/build-pc.mjs", env);
      runReleaseCommand("node scripts/release/build-mobile.mjs", env);
      runReleaseCommand("node scripts/release/sign-artifacts.mjs", env);
      runReleaseCommand(
        "node scripts/release/create-release-manifest.mjs --version=v0.9.0",
        env
      );

      runReleaseCommand("node scripts/release/build-pc.mjs", env);
      runReleaseCommand("node scripts/release/build-mobile.mjs", env);
      runReleaseCommand("node scripts/release/sign-artifacts.mjs", env);
      runReleaseCommand(
        "node scripts/release/create-release-manifest.mjs --version=v1.0.0",
        env
      );

      runReleaseCommand("node scripts/release/rollback-release.mjs --target=v0.9.0", env);

      expect(existsSync(join(sandbox, "artifacts/pc/pc-build.json"))).toBe(true);
      expect(existsSync(join(sandbox, "artifacts/mobile/mobile-build.json"))).toBe(true);
      expect(existsSync(join(sandbox, "artifacts/signatures/signatures.json"))).toBe(true);
      expect(existsSync(join(sandbox, "releases/v1.0.0/manifest.json"))).toBe(true);

      const current = JSON.parse(
        readFileSync(join(sandbox, "release-state/current.json"), "utf8")
      ) as { version: string };
      expect(current.version).toBe("v0.9.0");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("contains release and rollback workflows plus runbook", () => {
    const releaseWorkflow = readFileSync(
      join(process.cwd(), ".github/workflows/release.yml"),
      "utf8"
    );
    const rollbackWorkflow = readFileSync(
      join(process.cwd(), ".github/workflows/rollback.yml"),
      "utf8"
    );
    const runbook = readFileSync(join(process.cwd(), "docs/release-runbook.md"), "utf8");

    expect(releaseWorkflow).toContain("workflow_dispatch");
    expect(releaseWorkflow).toContain("release_version");
    expect(rollbackWorkflow).toContain("target_version");
    expect(runbook).toContain("Go/No-Go");
    expect(runbook).toContain("回滚流程");
  });
});

