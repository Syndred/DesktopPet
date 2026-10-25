import catalog from '../resources/assets/roster-v2/catalog.json' with { type: 'json' };

const roleNames = new Map(catalog.characters.map(character => [character.templateId, character.name]));

/** Read-only presentation. Never persist this projection or use its text as an instance key. */
export function companionIdentity(pet) {
  // Appearance can change independently; the original template defines the role.
  const roleName = roleNames.get(pet.templateId) || '历史伙伴';
  const serial = pet.globalSerial;
  return {
    roleName,
    // Consume confirmed metadata only. No UUID/legacy-serial fallback or local
    // allocation; keeping text also preserves integers above JS Number precision.
    instanceNumber: typeof serial === 'string' && /^[1-9][0-9]*$/u.test(serial) ? serial.padStart(4, '0') : '待同步',
    historicalNickname: pet.name !== roleName ? pet.name : null
  };
}
