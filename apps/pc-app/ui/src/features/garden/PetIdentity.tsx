import { useEffect, useState } from 'react';
import type { GardenPet } from '../../../../../../packages/shared-types/src/features/garden';
import { companionIdentity } from '../companions/identity';

type DisplayIdentity = ReturnType<typeof companionIdentity>;

// The shared helper owns numeric formatting and the pending fallback.
export const gardenPetIdentity = companionIdentity;

export const petIdentityLabel = (identity: DisplayIdentity | null) => `${identity?.roleName || '伙伴'}（编号 ${identity?.instanceNumber || '待同步'}）`;

const identityRequests = new Map<string, Promise<DisplayIdentity | null>>();
function readOwnedIdentity(ownerAccountId: string, petId: string) {
  const key = `${ownerAccountId}\0${petId}`;
  const existing = identityRequests.get(key);
  if (existing) return existing;
  const request = window.lingjing.invoke<GardenPet>('companions', 'get', { petId }).then(result => {
    if (!result.ok || result.data.ownerAccountId !== ownerAccountId || result.data.petId !== petId) return null;
    return gardenPetIdentity(result.data);
  }).finally(() => { identityRequests.delete(key); });
  identityRequests.set(key, request);
  return request;
}

/** Presentation only. Missing template/number metadata uses the owned-pet API,
 * never a resource/appearance guess or a write back into the saved companion. */
export function usePetIdentity(pet: GardenPet | undefined, ownerAccountId = pet?.ownerAccountId, petId = pet?.petId || '') {
  const ownedPet = pet?.ownerAccountId === ownerAccountId && pet?.petId === petId ? pet : undefined;
  const hasTemplate = Boolean(ownedPet && typeof ownedPet.templateId === 'string' && ownedPet.templateId);
  const projected = ownedPet && hasTemplate ? gardenPetIdentity(ownedPet) : null;
  const needsLookup = !projected || projected.instanceNumber === '待同步';
  const key = `${ownerAccountId || ''}\0${petId}`;
  const [resolved, setResolved] = useState<{ key: string; identity: DisplayIdentity } | null>(null);
  useEffect(() => {
    if (!needsLookup || !ownerAccountId || !petId) return;
    let active = true;
    void readOwnedIdentity(ownerAccountId, petId).then(identity => {
      if (active && identity) setResolved({ key, identity });
    }).catch(() => { /* An unavailable/unconfirmed number remains pending. */ });
    return () => { active = false; };
  }, [needsLookup, ownerAccountId, petId, key, pet]);
  return !needsLookup ? projected : resolved?.key === key ? resolved.identity : projected;
}

export function PetIdentity({ identity, petId, showNickname = false }: { identity: DisplayIdentity | null; petId: string; showNickname?: boolean }) {
  return <span className="garden-pet-identity" data-pet-id={petId}>
    <strong>{identity?.roleName || '角色身份待确认'}</strong>
    <small className="garden-instance-number">编号 {identity?.instanceNumber || '待同步'}</small>
    {showNickname && identity?.historicalNickname && <small className="garden-historical-name">历史昵称：{identity.historicalNickname}</small>}
  </span>;
}
