export type CropId = "carrot" | "tomato" | "berry" | "rice";
export type ItemId = CropId | "cooked_rice" | `seed:${CropId}`;
export type GardenCommand = "plant" | "harvest" | "craft" | "feed" | "garrison" | "territoryLocate" | "territoryChallenge" | "territorySettle";
export interface FoodEffects { satiety: number; mood: number; intimacy: number }
export interface Crop { id: CropId; name: string; icon: string; seedItemId: ItemId; harvestItemId: ItemId; growMs: number; yield: number; color: string }
export interface GardenItem { id: ItemId; name: string; icon: string; category: "seed" | "food" | "ingredient" | "decoration" | "tool"; source: string; effects: FoodEffects | null; quantity: number }
export interface GardenPlot { plotId: string; cropType: CropId | null; plantedAt: number | null; maturesAt: number | null; yieldQuantity: number; revision: number; stage: "empty" | "growing" | "mature" }
export interface GardenPet { petId: string; ownerAccountId: string; templateId: string; name: string; revision: number; element?: string; growth: { level: number; satiety: number; mood: number; affinity: number }; resource?: { resourceId?: string; previewUrl?: string; thumbnail?: string } }
export interface GardenTerritory { id: string; name: string; regionName?: string; ownerAccountId: string | null; ownerName?: string; revision: number; captureMultiplier: number; garrisonPetId: string | null; boundary?: { lat: number; lng: number }[]; mapBoundary?: { lat: number; lng: number }[]; logs?: { id: string; action: string; actorName: string; createdAt: string }[] }
export interface Recipe { id: string; name: string; input: { itemId: ItemId; quantity: number }; output: { itemId: ItemId; quantity: number } }
export interface GardenLedgerEntry { id: string; actionId: string; kind: string; itemId: ItemId; delta: number; balance: number; petId: string | null; createdAt: number }
export interface GardenSnapshot { ownerAccountId: string; serverTime: number; plots: GardenPlot[]; items: GardenItem[]; crops: Crop[]; recipes: Recipe[]; pets: GardenPet[]; territories: GardenTerritory[]; ledger: GardenLedgerEntry[]; remainingInvasions?: number; territoryChallenges?: { sessionId: string; territoryId: string }[]; sync: { mode: "local" | "available" | "cloud" | "cached"; pending: number; conflicts: number; issue?: string } }
export type GardenResult<T> = { ok: true; data: T; revision: number; replayed?: boolean } | { ok: false; code: string; message: string; revision?: number };
export interface ActionInput { actionId: string; expectedRevision: number; sessionOwnerAccountId: string }
export interface PlantInput extends ActionInput { plotId: string; cropType: CropId }
export interface HarvestInput extends ActionInput { plotIds: string[] }
export interface CraftInput extends ActionInput { recipeId: string; quantity: number }
export interface FeedInput extends ActionInput { itemId: ItemId; petId: string; quantity: number; expectedPetRevision: number }
export interface GarrisonInput extends ActionInput { territoryId: string; petId: string | null; expectedTerritoryRevision: number }
