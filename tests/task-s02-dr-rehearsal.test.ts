import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

describe("S-02 disaster recovery rehearsal", () => {
  it("backs up and restores release state", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "qp-dr-"));
    const rootDir = join(sandbox, "project");
    const releasesDir = join(rootDir, "releases", "v0.1.0");
    const stateDir = join(rootDir, "release-state");
    const backupDir = join(sandbox, "backups");

    try {
      mkdirSync(releasesDir, { recursive: true });
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(join(releasesDir, "manifest.json"), JSON.stringify({ version: "v0.1.0" }), {
        encoding: "utf8",
        flag: "w"
      });
      writeFileSync(
        join(stateDir, "current.json"),
        JSON.stringify({ version: "v0.1.0" }),
        "utf8"
      );

      execSync("node scripts/dr/backup-state.mjs --label=dr-test", {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ROOT_DIR: rootDir,
          BACKUP_DIR: backupDir
        },
        stdio: "pipe"
      });

      writeFileSync(
        join(stateDir, "current.json"),
        JSON.stringify({ version: "v9.9.9" }),
        "utf8"
      );

      execSync("node scripts/dr/restore-state.mjs --label=dr-test", {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ROOT_DIR: rootDir,
          BACKUP_DIR: backupDir
        },
        stdio: "pipe"
      });

      const restoredCurrent = JSON.parse(
        readFileSync(join(stateDir, "current.json"), "utf8")
      ) as { version: string };
      expect(restoredCurrent.version).toBe("v0.1.0");
      expect(existsSync(join(stateDir, "last-restore.json"))).toBe(true);
      expect(existsSync(join(backupDir, "dr-test", "backup-metadata.json"))).toBe(true);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("contains disaster recovery runbook", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/disaster-recovery-runbook.md"),
      "utf8"
    );
    expect(doc).toContain("执行备份");
    expect(doc).toContain("执行恢复");
    expect(doc).toContain("演练频率");
  });
});
