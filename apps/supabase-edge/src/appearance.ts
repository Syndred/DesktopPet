import { APP_ERROR_CODES, fail, ok, type ApiResponse, type ElementType } from "@qingpet/shared-types";

export type AppearanceSlot = "head" | "body" | "accessory" | "aura";

export interface AppearanceItem {
  id: string;
  slot: AppearanceSlot;
  name: string;
  compatibleElements: Array<ElementType | "all">;
}

export interface PetAppearanceSnapshot {
  petId: string;
  equipped: Partial<Record<AppearanceSlot, string>>;
}

export class InMemoryAppearanceService {
  private readonly catalog = new Map<string, AppearanceItem>();
  private readonly equippedByPet = new Map<string, Partial<Record<AppearanceSlot, string>>>();

  registerCatalogItems(items: AppearanceItem[]): void {
    for (const item of items) {
      this.catalog.set(item.id, item);
    }
  }

  equipItem(input: {
    petId: string;
    petElement: ElementType;
    itemId: string;
  }): ApiResponse<PetAppearanceSnapshot> {
    const item = this.catalog.get(input.itemId);
    if (!item) {
      return fail("appearance-equip", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND, "item not found");
    }

    const compatible =
      item.compatibleElements.includes("all") ||
      item.compatibleElements.includes(input.petElement);
    if (!compatible) {
      return fail(
        "appearance-equip",
        APP_ERROR_CODES.VALIDATION_INVALID_PAYLOAD,
        "item not compatible with pet element"
      );
    }

    const equipped = this.equippedByPet.get(input.petId) ?? {};
    equipped[item.slot] = item.id;
    this.equippedByPet.set(input.petId, equipped);

    return ok("appearance-equip", {
      petId: input.petId,
      equipped: { ...equipped }
    });
  }

  getAppearanceSnapshot(petId: string): PetAppearanceSnapshot {
    return {
      petId,
      equipped: { ...(this.equippedByPet.get(petId) ?? {}) }
    };
  }

  restoreAppearanceSnapshot(snapshot: PetAppearanceSnapshot): ApiResponse<{ restored: true }> {
    // Ignore stale item ids not in catalog to avoid runtime render crash.
    const restored: Partial<Record<AppearanceSlot, string>> = {};
    for (const [slot, itemId] of Object.entries(snapshot.equipped)) {
      if (!itemId) continue;
      if (this.catalog.has(itemId)) {
        restored[slot as AppearanceSlot] = itemId;
      }
    }
    this.equippedByPet.set(snapshot.petId, restored);
    return ok("appearance-restore", { restored: true });
  }
}

