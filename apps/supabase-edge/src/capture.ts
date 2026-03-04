import { randomUUID } from "node:crypto";

import {
  APP_ERROR_CODES,
  fail,
  ok,
  type ApiResponse,
  type ElementType
} from "@qingpet/shared-types";

import { canCaptureWithinGeofence, type GeoPoint, type SpawnedPet } from "./lbs.js";

export interface CapturedPetRecord {
  id: string;
  ownerId: string;
  name: string;
  element: ElementType;
  capturedAt: string;
}

export interface MemoryTagRecord {
  id: string;
  petId: string;
  ownerId: string;
  tag: string;
  createdAt: string;
}

export interface CaptureRecord {
  id: string;
  userId: string;
  petId: string;
  spawnPointId: string;
  distanceMeters: number;
  memoryTag: string;
  capturedAt: string;
}

export interface PokedexEntry {
  petId: string;
  ownerId: string;
  element: ElementType;
  capturedAt: string;
  memoryTag: string;
}

interface ServiceState {
  pets: CapturedPetRecord[];
  memoryTags: MemoryTagRecord[];
  captures: CaptureRecord[];
  pokedexByUser: Record<string, PokedexEntry[]>;
}

export class InMemoryCaptureService {
  private pets = new Map<string, CapturedPetRecord>();
  private memoryTags = new Map<string, MemoryTagRecord>();
  private captures = new Map<string, CaptureRecord>();
  private pokedexByUser = new Map<string, PokedexEntry[]>();

  adoptCapturedPet(input: {
    userId: string;
    spawnedPet: SpawnedPet;
    petName: string;
    memoryTag: string;
    userPosition: GeoPoint;
    spawnPosition: GeoPoint;
    geofenceMeters?: number;
    gpsAccuracyMeters?: number;
    simulateFailureAt?: "after_pet" | "after_tag" | "after_capture";
  }): ApiResponse<{
    pet: CapturedPetRecord;
    tag: MemoryTagRecord;
    capture: CaptureRecord;
    pokedexSize: number;
  }> {
    const check = canCaptureWithinGeofence({
      userPosition: input.userPosition,
      spawnPosition: input.spawnPosition,
      geofenceMeters: input.geofenceMeters ?? 100,
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? 0
    });

    if (!check.inRange) {
      return fail(
        "capture-adopt",
        APP_ERROR_CODES.BATTLE_INVALID_ACTION,
        "capture out of geofence range"
      );
    }

    const snapshot = this.exportState();
    try {
      const now = new Date().toISOString();
      const pet: CapturedPetRecord = {
        id: randomUUID(),
        ownerId: input.userId,
        name: input.petName,
        element: input.spawnedPet.element,
        capturedAt: now
      };
      this.pets.set(pet.id, pet);

      if (input.simulateFailureAt === "after_pet") {
        throw new Error("simulated failure after pet");
      }

      const tag: MemoryTagRecord = {
        id: randomUUID(),
        petId: pet.id,
        ownerId: input.userId,
        tag: input.memoryTag,
        createdAt: now
      };
      this.memoryTags.set(tag.id, tag);

      if (input.simulateFailureAt === "after_tag") {
        throw new Error("simulated failure after tag");
      }

      const capture: CaptureRecord = {
        id: randomUUID(),
        userId: input.userId,
        petId: pet.id,
        spawnPointId: input.spawnedPet.spawnPointId,
        distanceMeters: Number(check.compensatedDistanceMeters.toFixed(2)),
        memoryTag: input.memoryTag,
        capturedAt: now
      };
      this.captures.set(capture.id, capture);

      if (input.simulateFailureAt === "after_capture") {
        throw new Error("simulated failure after capture");
      }

      const userPokedex = this.pokedexByUser.get(input.userId) ?? [];
      userPokedex.push({
        petId: pet.id,
        ownerId: input.userId,
        element: pet.element,
        capturedAt: now,
        memoryTag: input.memoryTag
      });
      this.pokedexByUser.set(input.userId, userPokedex);

      return ok("capture-adopt", {
        pet,
        tag,
        capture,
        pokedexSize: userPokedex.length
      });
    } catch (error) {
      this.restoreState(snapshot);
      return fail(
        "capture-adopt",
        APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR,
        (error as Error).message
      );
    }
  }

  getPokedex(userId: string): PokedexEntry[] {
    return [...(this.pokedexByUser.get(userId) ?? [])];
  }

  getMemoryTagsByPetId(petId: string): MemoryTagRecord[] {
    return [...this.memoryTags.values()].filter((tag) => tag.petId === petId);
  }

  exportState(): ServiceState {
    return {
      pets: [...this.pets.values()],
      memoryTags: [...this.memoryTags.values()],
      captures: [...this.captures.values()],
      pokedexByUser: Object.fromEntries(
        [...this.pokedexByUser.entries()].map(([userId, entries]) => [userId, [...entries]])
      )
    };
  }

  static fromState(state: ServiceState): InMemoryCaptureService {
    const svc = new InMemoryCaptureService();
    svc.restoreState(state);
    return svc;
  }

  private restoreState(state: ServiceState): void {
    this.pets = new Map(state.pets.map((item) => [item.id, { ...item }]));
    this.memoryTags = new Map(state.memoryTags.map((item) => [item.id, { ...item }]));
    this.captures = new Map(state.captures.map((item) => [item.id, { ...item }]));
    this.pokedexByUser = new Map(
      Object.entries(state.pokedexByUser).map(([userId, entries]) => [
        userId,
        entries.map((entry) => ({ ...entry }))
      ])
    );
  }
}

