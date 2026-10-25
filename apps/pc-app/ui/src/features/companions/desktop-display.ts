import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';

export function desktopPresentation(snapshot: CompanionsSnapshot | null, pet: CompanionPet) {
  const display = snapshot?.desktopDisplay;
  const limit = display?.limit;
  const matched = snapshot?.ownerAccountId === pet.ownerAccountId && display?.ownerAccountId === pet.ownerAccountId && display.available;
  const state = !pet.desktop.visible ? 'off' : matched ? display.pets.find(value => value.petId === pet.petId)?.state || 'unknown' : 'unknown';
  const reason = matched ? display.pets.find(value => value.petId === pet.petId)?.reason : null;
  if (state === 'visible') return { state, badge: '桌面中', label: '正在桌面陪你', note: '桌面陪伴已开启，当前正在显示。' };
  if (state === 'waiting') return { state, badge: '等待空位', label: '已开启，等待桌面空位', note: `陪伴已开启。${limit ? `当前最多显示 ${limit} 只，` : ''}空出位置后会自动显示。` };
  if (state === 'hidden') return { state, badge: reason === 'fullscreen' ? '暂时隐藏' : '暂未显示', label: reason === 'fullscreen' ? '全屏时暂时隐藏' : '已开启，暂未显示', note: reason === 'fullscreen' ? '陪伴仍已开启，退出全屏后会按上限恢复显示。' : '陪伴仍已开启，当前暂未显示。' };
  if (state === 'off' && !pet.desktop.visible) return { state, badge: '未开启', label: '未开启桌面陪伴', note: '开启后会按当前上限安排显示。' };
  return { state: 'unknown', badge: '状态待确认', label: '已开启，桌面状态待确认', note: '陪伴已开启，正在确认桌面状态。' };
}

export function desktopSummary(snapshot: CompanionsSnapshot) {
  const visible = snapshot.pets.filter(pet => desktopPresentation(snapshot, pet).state === 'visible');
  const enabled = snapshot.pets.filter(pet => pet.desktop.visible).length;
  const confirmed = snapshot.desktopDisplay?.ownerAccountId === snapshot.ownerAccountId && snapshot.desktopDisplay.available && !snapshot.pets.some(pet => desktopPresentation(snapshot, pet).state === 'unknown');
  const limit = snapshot.desktopDisplay?.ownerAccountId === snapshot.ownerAccountId && snapshot.desktopDisplay.available ? snapshot.desktopDisplay.limit : null;
  return { visible, enabled, confirmed, countLabel: confirmed ? String(visible.length) : '待确认',
    policyNote: `${limit ? `当前最多同时显示 ${limit} 只。` : '桌面按设置中的上限显示。'}超出上限的伙伴等待空位，临时隐藏不会关闭陪伴偏好。` };
}
