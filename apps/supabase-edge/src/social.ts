import { randomUUID } from "node:crypto";

export interface PresenceAtPoint {
  pointId: string;
  userId: string;
  petId: string;
}

export interface GlimmerInteraction {
  id: string;
  pointId: string;
  petAId: string;
  petBId: string;
  interactionType: "wave" | "dance" | "sparkle";
  createdAt: string;
}

interface GuardRecord {
  id: string;
  targetUserId: string;
  guardianUserId: string;
  petId: string;
  createdAt: string;
}

export class InMemoryLightSocialService {
  private guardRecords: GuardRecord[] = [];

  triggerGlimmerEncounter(presences: PresenceAtPoint[]): GlimmerInteraction[] {
    if (presences.length < 2) return [];

    const interactions: GlimmerInteraction[] = [];
    const sorted = [...presences].sort((a, b) => a.userId.localeCompare(b.userId));
    const types: GlimmerInteraction["interactionType"][] = ["wave", "dance", "sparkle"];

    for (let i = 0; i + 1 < sorted.length; i += 2) {
      const left = sorted[i];
      const right = sorted[i + 1];
      interactions.push({
        id: randomUUID(),
        pointId: left.pointId,
        petAId: left.petId,
        petBId: right.petId,
        interactionType: types[i % types.length],
        createdAt: new Date().toISOString()
      });
    }

    return interactions;
  }

  createAnonymousGuard(input: {
    guardianUserId: string;
    targetUserId: string;
    petId: string;
  }): { id: string } {
    const record: GuardRecord = {
      id: randomUUID(),
      guardianUserId: input.guardianUserId,
      targetUserId: input.targetUserId,
      petId: input.petId,
      createdAt: new Date().toISOString()
    };
    this.guardRecords.push(record);
    return { id: record.id };
  }

  getAnonymousGuardFeed(targetUserId: string): Array<{
    id: string;
    petId: string;
    message: string;
    createdAt: string;
  }> {
    return this.guardRecords
      .filter((item) => item.targetUserId === targetUserId)
      .map((item) => ({
        id: item.id,
        petId: item.petId,
        message: "有温柔的人守护了你",
        createdAt: item.createdAt
      }));
  }
}

