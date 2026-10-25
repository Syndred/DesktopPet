import type { CompanionDisplayIdentity, CompanionPet } from '../../../../../packages/shared-types/src/features/companions/index';

export type CompanionIdentitySource = Pick<CompanionPet, 'templateId' | 'name' | 'globalSerial'> & Partial<Pick<CompanionPet, 'petId'>>;

/** Display projection only; ownership and resource rendering still use their original instance keys. */
export function companionIdentity(pet: CompanionIdentitySource): CompanionDisplayIdentity;
