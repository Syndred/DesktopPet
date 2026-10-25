import type { CompanionDisplayIdentity, CompanionPet } from '../../../../../packages/shared-types/src/features/companions/index';

export function companionIdentity(pet: Pick<CompanionPet, 'templateId' | 'petId' | 'name'>): CompanionDisplayIdentity;
