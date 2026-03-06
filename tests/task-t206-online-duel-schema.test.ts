import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "infra/supabase/migrations/0003_duel_realtime_schema.sql"
);

describe("T-206 online duel realtime schema migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

  it("creates duel room/action/round tables", () => {
    expect(sql).toContain("create table if not exists public.duel_rooms");
    expect(sql).toContain("create table if not exists public.duel_actions");
    expect(sql).toContain("create table if not exists public.duel_rounds");
  });

  it("creates unique indexes for round resolution idempotency", () => {
    expect(sql).toContain("idx_duel_actions_unique_actor_round");
    expect(sql).toContain("idx_duel_rounds_unique_round");
  });

  it("enables rls and select policies for realtime prototype", () => {
    expect(sql).toContain("alter table public.duel_rooms enable row level security;");
    expect(sql).toContain("alter table public.duel_actions enable row level security;");
    expect(sql).toContain("alter table public.duel_rounds enable row level security;");
    expect(sql).toContain('create policy "duel_rooms_select_realtime"');
    expect(sql).toContain('create policy "duel_actions_select_realtime"');
    expect(sql).toContain('create policy "duel_rounds_select_realtime"');
  });

  it("adds duel tables to supabase_realtime publication", () => {
    expect(sql).toContain("alter publication supabase_realtime add table public.duel_rooms");
    expect(sql).toContain("alter publication supabase_realtime add table public.duel_actions");
    expect(sql).toContain("alter publication supabase_realtime add table public.duel_rounds");
  });
});
