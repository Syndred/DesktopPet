import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "infra/supabase/migrations/0001_core_schema.sql"
);

describe("T-003 supabase schema migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates all core tables", () => {
    const requiredTables = [
      "player_profiles",
      "pets",
      "pet_memory_tags",
      "geo_spawn_points",
      "captures",
      "battle_rooms",
      "battle_round_actions",
      "territories",
      "territory_logs",
      "emotion_snapshots"
    ];

    requiredTables.forEach((tableName) => {
      expect(sql).toContain(`create table if not exists public.${tableName}`);
    });
  });

  it("enables rls for all core tables", () => {
    const requiredRlsStatements = [
      "alter table public.player_profiles enable row level security;",
      "alter table public.pets enable row level security;",
      "alter table public.pet_memory_tags enable row level security;",
      "alter table public.geo_spawn_points enable row level security;",
      "alter table public.captures enable row level security;",
      "alter table public.battle_rooms enable row level security;",
      "alter table public.battle_round_actions enable row level security;",
      "alter table public.territories enable row level security;",
      "alter table public.territory_logs enable row level security;",
      "alter table public.emotion_snapshots enable row level security;"
    ];

    requiredRlsStatements.forEach((statement) => {
      expect(sql).toContain(statement);
    });
  });

  it("includes geospatial indexes for lbs tables", () => {
    expect(sql).toContain(
      "create index if not exists idx_geo_spawn_points_geom on public.geo_spawn_points using gist(geom);"
    );
    expect(sql).toContain(
      "create index if not exists idx_territories_boundary on public.territories using gist(boundary);"
    );
  });

  it("contains participant checks for battle action inserts", () => {
    expect(sql).toContain('create policy "battle_round_actions_insert_actor"');
    expect(sql).toContain("player_id = auth.uid()");
    expect(sql).toContain("from public.battle_rooms br");
  });
});

