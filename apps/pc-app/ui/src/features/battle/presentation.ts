import type { BattleParticipant, BattleRound, BattleRulesProfile, BattleStatus } from '../../../../../../packages/shared-types/src/features/battle';
import type { ElementType } from '../../../../../../packages/shared-types/src/battle';

export const elements = {
  metal: { label: '金', symbol: '✦', color: '#a28a3e', hint: '易伤：受到的伤害每层 ×1.5' },
  wood: { label: '木', symbol: '❧', color: '#439875', hint: '寄生：每层吸取 2 生命' },
  earth: { label: '土', symbol: '◆', color: '#b18a65', hint: '迟钝：输出伤害每层 ×0.5' },
  water: { label: '水', symbol: '◒', color: '#4d8fe8', hint: '寒意：命中后令对手怒气减半' },
  fire: { label: '火', symbol: '♨', color: '#e78b67', hint: '燃烧：每层扣除当前生命的 8%' }
} as const;
export const actionLabels = { normal_attack: '普通攻击', element_attack: '属性攻击', dodge: '闪避', ultimate: '大招', stunned: '无法行动' };
export const statusLabels: Record<string, string> = { burn: '燃烧', freeze: '冻结', parasite: '寄生', vulnerability: '易伤', petrify: '迟钝' };
export const modeLabels: Record<string, string> = { training: '训练', friend: '好友对战', wild: '野外挑战', territory: '领地挑战', duel: '旧版对战', capture: '旧版捕捉' };
/** Icons retain player/enemy order; only the authoritative counter direction changes. */
export function battleAffinity(player: ElementType, enemy: ElementType, rules: BattleRulesProfile) {
  const direction = player !== enemy && rules.advantage?.[player] === enemy ? 'right'
    : player !== enemy && rules.advantage?.[enemy] === player ? 'left' : 'neutral';
  return { direction, symbol: direction === 'right' ? '→' : direction === 'left' ? '←' : '—',
    label: direction === 'right' ? `${elements[player].label}克制${elements[enemy].label}，从左向右，克制 ×1.2`
      : direction === 'left' ? `${elements[enemy].label}克制${elements[player].label}，从右向左，受制 ×0.8`
        : `${elements[player].label}与${elements[enemy].label}无克制，伤害 ×1` };
}
export const statusLabel = (status: BattleStatus) => `${statusLabels[status.type] || status.type}${(status.stacks || 1) > 1 ? ` ×${status.stacks}` : ''} · ${status.duration} 回合`;
export function petName(pet: BattleParticipant | undefined) {
  if (pet?.petId === 'waiting-peer') return '对手未加入';
  const name = pet?.petName as string | { zh: string } | undefined;
  return typeof name === 'object' ? name.zh : name || '伙伴';
}
export function roundLines(round: BattleRound, player: BattleParticipant, enemy: BattleParticipant) {
  const lines: string[] = [];
  for (const [role, pet] of [['player', player], ['enemy', enemy]] as const) {
    const name = petName(pet);
    lines.push(`${name}使用${actionLabels[round.actions?.[role]] || '行动'}`);
    const direct = round.directDamage?.[role];
    if (direct != null && direct > 0) lines.push(`${name}受到 ${direct} 点直接伤害`);
    else if (direct == null && round.damageTaken?.[role] > 0) lines.push(`${name}受到 ${round.damageTaken[role]} 点伤害`);
    for (const event of round.dotDamageEvents?.[role] || []) lines.push(`${name}受到${statusLabels[event.type] || event.type}伤害 ${event.amount}`);
    for (const event of round.healEvents?.[role] || []) lines.push(`${name}通过${event.type === 'ultimate' ? '大招' : statusLabels[event.type] || event.type}恢复 ${event.amount} 生命`);
  }
  return lines;
}
export function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
