import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "infra/supabase/migrations/0002_pet_inventory_battle_reports.sql"
);

describe("T-205 persistence and battle-report schema migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates inventory persistence tables", () => {
    expect(sql).toContain("create table if not exists public.pet_instances");
    expect(sql).toContain("create table if not exists public.pet_capture_records");
    expect(sql).toContain("idx_pet_instances_owner_serial");
  });

  it("creates battle report tables", () => {
    expect(sql).toContain("create table if not exists public.battle_sessions");
    expect(sql).toContain("create table if not exists public.battle_round_events");
    expect(sql).toContain("idx_battle_round_events_unique_round");
  });

  it("enables rls policies for new tables", () => {
    expect(sql).toContain("alter table public.pet_instances enable row level security;");
    expect(sql).toContain("alter table public.battle_sessions enable row level security;");
    expect(sql).toContain('create policy "battle_sessions_select_owner"');
    expect(sql).toContain('create policy "battle_round_events_insert_owner"');
  });
});
