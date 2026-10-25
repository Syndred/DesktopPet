import type { ReactNode } from 'react';
import type { ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import { companionIdentity } from '../companions/identity';

type IdentitySource = Pick<ConversationPet, 'petId' | 'name'> & { templateId?: string | null };

/** Presentation only. Never replace fields on the source DTO or persist this view. */
export function conversationIdentity(pet: IdentitySource) {
  return companionIdentity({ petId: pet.petId, templateId: pet.templateId ?? '', name: pet.name });
}
export function petIdentityLabel(pet: IdentitySource) {
  const { roleName, instanceNumber } = conversationIdentity(pet);
  return `${roleName}，编号 ${instanceNumber}`;
}
export function petIdentityHint(pet: IdentitySource) {
  const { historicalNickname } = conversationIdentity(pet);
  return `${petIdentityLabel(pet)}${historicalNickname ? ` · 历史昵称：${historicalNickname}` : ''}`;
}
export function PetIdentity({ pet, historical = false, children }: { pet: IdentitySource; historical?: boolean; children?: ReactNode }) {
  const { roleName, instanceNumber, historicalNickname } = conversationIdentity(pet);
  return <span className="cv-identity" data-pet-id={pet.petId}>
    <span className="cv-identity-name">{roleName}{children}</span>
    <code className="cv-identity-number" title={`编号 ${instanceNumber}`}>编号 {instanceNumber}</code>
    {historical && historicalNickname ? <span className="cv-identity-history">历史昵称：{historicalNickname}</span> : null}
  </span>;
}
