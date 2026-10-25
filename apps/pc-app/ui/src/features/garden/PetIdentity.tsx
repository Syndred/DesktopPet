import { useEffect, useState } from 'react';
import type { GardenPet } from '../../../../../../packages/shared-types/src/features/garden';
import { companionIdentity } from '../companions/identity';

type DisplayIdentity = ReturnType<typeof companionIdentity>;

/** Presentation only. A missing cross-domain template uses the owned-pet API,
 * never a resource/appearance guess or a write back into the saved companion. */
export function usePetIdentity(pet: GardenPet | undefined, ownerAccountId = pet?.ownerAccountId, petId = pet?.petId || '') {
  const hasTemplate = Boolean(pet && typeof pet.templateId === 'string' && pet.templateId);
  const key = `${ownerAccountId || ''}\0${petId}`;
  const [resolved, setResolved] = useState<{ key: string; identity: DisplayIdentity } | null>(null);
  useEffect(() => {
    if (hasTemplate || !ownerAccountId || !petId) return;
    let active = true;
    void window.lingjing.invoke<DisplayIdentity>('companions', 'identity', { petId }).then(result => {
      if (active && result.ok && result.data.instanceNumber === petId) setResolved({ key, identity: result.data });
    }).catch(() => { /* Keep the exact original number visible if lookup is unavailable. */ });
    return () => { active = false; };
  }, [hasTemplate, ownerAccountId, petId, key]);
  return pet && hasTemplate ? companionIdentity(pet) : resolved?.key === key ? resolved.identity : null;
}

export function PetIdentity({ identity, petId, showNickname = false }: { identity: DisplayIdentity | null; petId: string; showNickname?: boolean }) {
  return <span className="garden-pet-identity" data-pet-id={petId}>
    <strong>{identity?.roleName || '角色身份待确认'}</strong>
    <small className="garden-instance-number">编号 {petId}</small>
    {showNickname && identity?.historicalNickname && <small className="garden-historical-name">历史昵称：{identity.historicalNickname}</small>}
  </span>;
}
