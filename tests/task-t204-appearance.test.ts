import { describe, expect, it } from "vitest";

import { InMemoryAppearanceService } from "@qingpet/supabase-edge";

describe("T-204 appearance and outfit", () => {
  it("equips item into slot and replaces previous slot item", () => {
    const svc = new InMemoryAppearanceService();
    svc.registerCatalogItems([
      { id: "head_1", slot: "head", name: "小帽子", compatibleElements: ["all"] },
      { id: "head_2", slot: "head", name: "大帽子", compatibleElements: ["all"] }
    ]);

    const first = svc.equipItem({ petId: "pet-a", petElement: "fire", itemId: "head_1" });
    expect(first.ok).toBe(true);

    const second = svc.equipItem({ petId: "pet-a", petElement: "fire", itemId: "head_2" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.equipped.head).toBe("head_2");
  });

  it("rejects incompatible element outfit", () => {
    const svc = new InMemoryAppearanceService();
    svc.registerCatalogItems([
      { id: "water_aura", slot: "aura", name: "水灵光环", compatibleElements: ["water"] }
    ]);

    const result = svc.equipItem({
      petId: "pet-b",
      petElement: "fire",
      itemId: "water_aura"
    });

    expect(result.ok).toBe(false);
  });

  it("restores snapshot and ignores missing catalog items", () => {
    const svc = new InMemoryAppearanceService();
    svc.registerCatalogItems([
      { id: "body_1", slot: "body", name: "经典外套", compatibleElements: ["all"] }
    ]);

    const restored = svc.restoreAppearanceSnapshot({
      petId: "pet-c",
      equipped: {
        body: "body_1",
        head: "head_missing"
      }
    });
    expect(restored.ok).toBe(true);

    const snapshot = svc.getAppearanceSnapshot("pet-c");
    expect(snapshot.equipped.body).toBe("body_1");
    expect(snapshot.equipped.head).toBeUndefined();
  });
});

