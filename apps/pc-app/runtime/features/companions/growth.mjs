const defaultReject = message => { throw Object.assign(new Error(message), { code: 'INVALID_INPUT' }); };
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** The existing companion growth rule, shared by SQLite and cloud reducers.
 * Returns a new growth value; persistence, ownership and receipts belong to the
 * caller's already verified, atomic domain transaction. */
export function applyGrowthEffect(growth, effect, reject = defaultReject) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) reject('养成效果无效');
  const fields = ['mood', 'satiety', 'affinity', 'experience', 'wins'];
  for (const key of Object.keys(effect)) if (!fields.includes(key)) reject('不支持的养成效果');
  for (const key of fields) if (effect[key] !== undefined && (!Number.isSafeInteger(effect[key]) || Math.abs(effect[key]) > 10000)) reject('养成效果无效');
  if ((effect.experience || 0) < 0 || (effect.wins || 0) < 0) reject('经验与胜场不能减少');
  const next = { ...growth, stats: { ...growth.stats } };
  for (const key of ['mood', 'satiety', 'affinity']) next[key] = clamp(next[key] + (effect[key] || 0), 0, 100);
  let experience = next.experience + (effect.experience || 0);
  // Preserve the existing 100 XP / +10% rule, including zero-valued stats.
  while (experience >= 100) {
    experience -= 100; next.level++;
    for (const key of ['hp', 'atk', 'def', 'spd']) {
      const value = next.stats[key];
      next.stats[key] = value <= 0 ? 0 : Math.max(value + 1, Math.round(value * 1.1));
    }
  }
  next.experience = experience; next.winsTotal += effect.wins || 0;
  return next;
}

/** Existing battle/service.cjs participation policy; callers cannot pick XP. */
export function battleGrowthEffect(won) {
  if (typeof won !== 'boolean') defaultReject('战斗结果无效');
  return { experience: won ? 20 : 5, wins: won ? 1 : 0 };
}
