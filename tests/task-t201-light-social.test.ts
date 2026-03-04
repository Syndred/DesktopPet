import { describe, expect, it } from "vitest";

import { InMemoryLightSocialService } from "@qingpet/supabase-edge";

describe("T-201 light social", () => {
  it("creates glimmer interactions for users at same point", () => {
    const svc = new InMemoryLightSocialService();
    const interactions = svc.triggerGlimmerEncounter([
      { pointId: "p1", userId: "u1", petId: "pet-1" },
      { pointId: "p1", userId: "u2", petId: "pet-2" },
      { pointId: "p1", userId: "u3", petId: "pet-3" }
    ]);

    expect(interactions.length).toBe(1);
    expect(interactions[0].petAId).toBeDefined();
    expect(interactions[0].petBId).toBeDefined();
  });

  it("stores anonymous guard without exposing guardian identity in feed", () => {
    const svc = new InMemoryLightSocialService();
    svc.createAnonymousGuard({
      guardianUserId: "guardian-x",
      targetUserId: "target-a",
      petId: "pet-a"
    });

    const feed = svc.getAnonymousGuardFeed("target-a");
    expect(feed.length).toBe(1);
    expect(feed[0].message).toBe("有温柔的人守护了你");
    expect((feed[0] as Record<string, unknown>).guardianUserId).toBeUndefined();
  });

  it("returns empty feed for unrelated users", () => {
    const svc = new InMemoryLightSocialService();
    svc.createAnonymousGuard({
      guardianUserId: "guardian-y",
      targetUserId: "target-b",
      petId: "pet-b"
    });

    expect(svc.getAnonymousGuardFeed("target-c")).toEqual([]);
  });
});

