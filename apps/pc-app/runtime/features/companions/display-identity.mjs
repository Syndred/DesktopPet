import catalog from '../resources/assets/roster-v2/catalog.json' with { type: 'json' };

const roleNames = new Map(catalog.characters.map(character => [character.templateId, character.name]));

/** Read-only presentation. Never persist this projection or use its text as an instance key. */
export function companionIdentity(pet) {
  // Appearance can change independently; the original template defines the role.
  const roleName = roleNames.get(pet.templateId) || '历史伙伴';
  return {
    roleName,
    // Full original identifier: no random replacement, hash, prefix or truncation.
    instanceNumber: pet.petId,
    historicalNickname: pet.name !== roleName ? pet.name : null
  };
}
