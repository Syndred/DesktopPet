const { companionIdentity } = require('../companions/display-identity.mjs');
const catalog = require('../resources/assets/roster-v2/catalog.json');
const templates = new Set(catalog.characters.map(character => character.templateId));
const number = value => typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const roomId = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value) ? value.toLowerCase() : null;
const namespace = value => value === 'live' || typeof value === 'string' && /^qa:[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$/u.test(value);
const clone = value => structuredClone(value);
function identityView(source) {
  const name = typeof source.name === 'string' ? source.name : source.name?.zh;
  return companionIdentity({ ...source, name: typeof name === 'string' ? name : '' });
}
function friendRoom(document) {
  if (document?.mode !== 'friend') return null;
  const direct = roomId(document.room?.id);
  const original = /^online-(.+)$/u.exec(document.sessionId || document.id || '');
  const saved = original ? roomId(original[1]) : null;
  return direct && saved && direct !== saved ? null : direct || saved;
}
function checkedMetadata(value, owner, requested) {
  if (value?.format !== 'lingjing.battle.serial-views' || value.version !== 1 || value.ownerAccountId !== owner || !namespace(value.namespace)
    || !Array.isArray(value.rooms) || value.rooms.length > 20) return null;
  const rooms = new Map();
  for (const room of value.rooms) {
    const id = roomId(room?.roomId);
    if (!id || rooms.has(id) || typeof room.roomRevision !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(room.roomRevision)
      || !Array.isArray(room.participants) || room.participants.length > 2) return null;
    const sides = new Set(), owners = new Set(), participants = [];
    for (const entry of room.participants) {
      if (!entry || !['host', 'guest'].includes(entry.side) || sides.has(entry.side) || !identifier(entry.ownerAccountId) || owners.has(entry.ownerAccountId)
        || !identifier(entry.petId) || !templates.has(entry.templateId) || !number(entry.globalSerial)) return null;
      sides.add(entry.side); owners.add(entry.ownerAccountId);
      participants.push({ side: entry.side, ownerAccountId: entry.ownerAccountId, petId: entry.petId, templateId: entry.templateId, globalSerial: entry.globalSerial });
    }
    rooms.set(id, { roomId: id, roomRevision: room.roomRevision, namespace: value.namespace, participants });
  }
  if (requested && (rooms.size !== requested.length || requested.some(id => !rooms.has(id)))) return null;
  return rooms;
}
function createBattleDisplayViews({ services, online, prepareOnline, waitMs = 750, cacheMs = 15000 }) {
  const cache = new Map(), territoryCache = new Map(), pending = new Map(), queue = [], disposers = [];
  let ownerSeen = services.session.getOwnerAccountId(), generation = 0, active = 0, disposed = false;
  const current = owner => !disposed && owner && services.session.getOwnerAccountId() === owner;
  const key = (owner, id) => owner + '\0' + id;
  function clear() { generation++; cache.clear(); territoryCache.clear(); pending.clear(); ownerSeen = services.session.getOwnerAccountId(); }
  function accept(value, owner, requested) {
    if (!current(owner)) return false;
    const rooms = checkedMetadata(value, owner, requested); if (!rooms) return false;
    let changed = false;
    for (const [id, room] of rooms) {
      const before = cache.get(key(owner, id));
      if (before && (before.room.roomRevision.length > room.roomRevision.length
        || before.room.roomRevision.length === room.roomRevision.length && before.room.roomRevision > room.roomRevision)) continue;
      if (before?.room.namespace === room.namespace && room.participants.some(entry => {
        const known = before.room.participants.find(previous => previous.side === entry.side);
        return known && (known.ownerAccountId !== entry.ownerAccountId || known.petId !== entry.petId || known.templateId !== entry.templateId || known.globalSerial !== entry.globalSerial);
      })) return false;
      // An empty/missing side is never a negative cache entry.
      if (!room.participants.length) { changed ||= Boolean(before); cache.delete(key(owner, id)); continue; }
      changed ||= JSON.stringify(before?.room.participants) !== JSON.stringify(room.participants) || before?.room.namespace !== room.namespace;
      cache.set(key(owner, id), { room, at: Date.now() });
    }
    while (cache.size > 200) cache.delete(cache.keys().next().value);
    if (changed) services.events?.emit('battle:online', { type: 'display-identities', ownerAccountId: owner, at: new Date().toISOString() });
    return true;
  }
  if (online.onDisplayMetadata) disposers.push(online.onDisplayMetadata((value, owner) => accept(value, owner)));
  if (online.onEvent) disposers.push(online.onEvent(event => {
    if (event.type === 'session-invalidated' || event.type === 'room-cleared' && ['user-cleared', 'user-switched', 'transport-changed'].includes(event.payload?.reason)) clear();
  }));
  for (const event of ['accounts:session-changed', 'accounts:changed', 'session:changed', 'auth:changed']) if (services.events?.on) disposers.push(services.events.on(event, clear));
  function pump() {
    while (!disposed && active < 2 && queue.length) {
      active++; const task = queue.shift();
      Promise.resolve().then(task.work).catch(() => {}).finally(() => { active--; task.done(); pump(); });
    }
  }
  function enqueue(work) { return new Promise(done => { queue.push({ work, done }); pump(); }); }
  function binding(document, owner) {
    const id = friendRoom(document), saved = id && cache.get(key(owner, id));
    if (!saved || Date.now() - saved.at > cacheMs || document.context?.cloudUserId && document.context.cloudUserId !== owner) return null;
    const own = saved.room.participants.find(entry => entry.ownerAccountId === owner && entry.petId === document.player?.petId);
    if (!own || document.side && document.side !== own.side) return null;
    if (document.room && (document.room[own.side + '_user_id'] && document.room[own.side + '_user_id'] !== owner
      || document.room[own.side + '_pet_id'] && document.room[own.side + '_pet_id'] !== own.petId)) return null;
    const other = own.side === 'host' ? 'guest' : 'host';
    const peer = saved.room.participants.find(entry => entry.side === other && entry.ownerAccountId !== owner && entry.petId === document.enemy?.petId);
    if (peer && document.room && (document.room[other + '_user_id'] && document.room[other + '_user_id'] !== peer.ownerAccountId
      || document.room[other + '_pet_id'] && document.room[other + '_pet_id'] !== peer.petId)) return null;
    return { own, peer };
  }
  function documents(value) {
    if (Array.isArray(value)) return value.filter(item => item?.player && item?.enemy);
    if (!value || typeof value !== 'object') return [];
    return [...(value.player && value.enemy ? [value] : []), ...(value.session ? [value.session] : []), ...(Array.isArray(value.reports) ? value.reports : [])];
  }
  async function ensure(owner, values) {
    const ids = [...new Set(values.filter(document => {
      const found = binding(document, owner);
      return !found?.own || document.enemy?.petId !== 'waiting-peer' && !found.peer;
    }).map(friendRoom).filter(Boolean))].slice(0, 200);
    if (!ids.length || !online.cloudProvider || services.get('accounts')?.privateSession?.()?.authKind !== 'supabase') return;
    const fresh = ids.filter(id => !pending.has(key(owner, id))), epoch = generation;
    for (let offset = 0; offset < fresh.length; offset += 20) {
      const batch = fresh.slice(offset, offset + 20);
      const task = enqueue(async () => {
        if (!current(owner) || epoch !== generation) return;
        try {
          prepareOnline(owner);
          const metadata = await online.invoke('get_display_metadata', { roomIds: batch });
          if (!current(owner) || epoch !== generation) return;
          if (!accept(metadata, owner, batch)) for (const id of batch) cache.delete(key(owner, id));
        } catch { if (epoch === generation) for (const id of batch) cache.delete(key(owner, id)); }
      });
      for (const id of batch) pending.set(key(owner, id), task);
      void task.finally(() => { for (const id of batch) if (pending.get(key(owner, id)) === task) pending.delete(key(owner, id)); });
    }
    const work = Promise.all(ids.map(id => pending.get(key(owner, id))).filter(Boolean));
    let timer; try { await Promise.race([work, new Promise(done => { timer = setTimeout(done, waitMs); })]); } finally { clearTimeout(timer); }
  }
  function territoryBinding(document, owner) {
    const saved = territoryCache.get(key(owner, document.sessionId || document.id));
    if (!saved || Date.now() - saved.at > cacheMs || saved.player && saved.player.petId !== document.player?.petId || saved.enemy && saved.enemy.petId !== document.enemy?.petId) return null;
    return saved;
  }
  async function ensureTerritories(owner, values) {
    const garden = services.get('garden');
    if (typeof garden?.getBattleSerialViews !== 'function') return;
    const provider = garden.getBattleSerialViews.bind(garden);
    const subjects = [...new Map(values.filter(document => document.mode === 'territory' && identifier(document.sessionId || document.id)
      && identifier(document.player?.petId) && identifier(document.enemy?.petId) && !territoryBinding(document, owner)?.enemy && territoryBinding(document, owner)?.enemyKind !== 'guardian')
      .map(document => [document.sessionId || document.id, { sessionId: document.sessionId || document.id, playerPetId: document.player.petId, enemyPetId: document.enemy.petId }])).values()].slice(0, 200);
    const pendingKey = id => 'territory\0' + key(owner, id), epoch = generation;
    const fresh = subjects.filter(subject => !pending.has(pendingKey(subject.sessionId)));
    for (let offset = 0; offset < fresh.length; offset += 20) {
      const batch = fresh.slice(offset, offset + 20), expected = new Map(batch.map(subject => [subject.sessionId, subject]));
      const task = enqueue(async () => {
        if (!current(owner) || epoch !== generation) return;
        try {
          const metadata = await provider({ ownerAccountId: owner, sessions: batch });
          if (!current(owner) || epoch !== generation) return;
          if (metadata?.format !== 'lingjing.territory.serial-views' || metadata.version !== 1 || metadata.ownerAccountId !== owner
            || !Array.isArray(metadata.sessions) || metadata.sessions.length !== batch.length
            || !(namespace(metadata.namespace) || metadata.namespace === null && metadata.sessions.every(row => row.player === null && row.enemy === null))) throw new Error('Invalid territory identity readback');
          const next = new Map();
          for (const row of metadata.sessions) {
            const subject = expected.get(row?.sessionId);
            if (!subject || next.has(row.sessionId)) throw new Error('Invalid territory session binding');
            for (const [side, petId] of [['player', subject.playerPetId], ['enemy', subject.enemyPetId]]) {
              const entry = row[side];
              if (entry !== null && (!entry || !identifier(entry.ownerAccountId) || side === 'player' && entry.ownerAccountId !== owner || entry.petId !== petId
                || !templates.has(entry.templateId) || !number(entry.globalSerial))) throw new Error('Invalid territory participant binding');
            }
            if (row.enemyKind !== undefined && !['guardian', 'instance'].includes(row.enemyKind) || row.enemyKind === 'guardian' && row.enemy !== null) throw new Error('Invalid guardian classification');
            next.set(row.sessionId, { player: row.player && clone(row.player), enemy: row.enemy && clone(row.enemy), enemyKind: row.enemyKind, at: Date.now() });
          }
          let changed = false;
          for (const [id, row] of next) {
            const previous = territoryCache.get(key(owner, id));
            changed ||= JSON.stringify([previous?.player, previous?.enemy, previous?.enemyKind]) !== JSON.stringify([row.player, row.enemy, row.enemyKind]);
            if (row.player || row.enemy || row.enemyKind === 'guardian') territoryCache.set(key(owner, id), row); else territoryCache.delete(key(owner, id));
          }
          while (territoryCache.size > 200) territoryCache.delete(territoryCache.keys().next().value);
          if (changed) services.events?.emit('battle:online', { type: 'display-identities', ownerAccountId: owner, at: new Date().toISOString() });
        } catch { if (epoch === generation) for (const subject of batch) territoryCache.delete(key(owner, subject.sessionId)); }
      });
      for (const subject of batch) pending.set(pendingKey(subject.sessionId), task);
      void task.finally(() => { for (const subject of batch) if (pending.get(pendingKey(subject.sessionId)) === task) pending.delete(pendingKey(subject.sessionId)); });
    }
    let timer;
    try { await Promise.race([Promise.all(subjects.map(subject => pending.get(pendingKey(subject.sessionId))).filter(Boolean)), new Promise(done => { timer = setTimeout(done, waitMs); })]); }
    finally { clearTimeout(timer); }
  }
  function ownIdentity(owner, participant) {
    try {
      const pet = services.get('companions')?.readIdentityPet?.(owner, participant.petId);
      if (pet?.ownerAccountId === owner && pet.petId === participant.petId) return identityView(pet);
    } catch { /* Deleted/unavailable historical entities remain pending. */ }
    return null;
  }
  function participantView(owner, participant, document, side) {
    if (!participant) return participant;
    const result = { ...participant }; delete result.globalSerial; delete result.displayIdentity; delete result.displayKind;
    let identity = identityView({ name: participant.petName }), kind = participant.petId === 'waiting-peer' ? 'waiting' : 'instance';
    if (side === 'player') identity = ownIdentity(owner, participant) || identity;
    if (document.mode === 'friend') {
      const entry = binding(document, owner)?.[side === 'player' ? 'own' : 'peer'];
      if (entry && (side === 'enemy' || identity.instanceNumber === '待同步')) identity = identityView({ ...entry, name: participant.petName });
    } else if (side === 'enemy' && document.mode === 'training' && participant.petId === `training-${participant.element}`) {
      const practice = catalog.characters.find(character => character.element === participant.element);
      if (practice) { identity = identityView({ templateId: practice.templateId, name: participant.petName }); kind = 'practice'; }
    } else if (side === 'enemy' && document.mode === 'wild') {
      const discovery = services.get('discovery')?.cloudRuntime, id = document.sessionId || document.id;
      const trusted = discovery?.handlesSession?.(id) ? discovery.peek(owner, id) : null;
      if (trusted?.mode === 'wild' && trusted.context?.cloudAuthority === 'discovery' && trusted.player?.petId === document.player?.petId
        && trusted.enemy?.petId === participant.petId && templates.has(trusted.enemy.templateId) && number(trusted.enemy.globalSerial)) {
        identity = identityView({ templateId: trusted.enemy.templateId, globalSerial: trusted.enemy.globalSerial, name: participant.petName });
      }
    } else if (document.mode === 'territory') {
      const view = territoryBinding(document, owner), entry = view?.[side];
      if (entry && (side === 'enemy' || identity.instanceNumber === '待同步')) identity = identityView({ ...entry, name: participant.petName });
      if (side === 'enemy' && view?.enemyKind === 'guardian') kind = 'guardian';
    }
    return { ...result, displayKind: kind, displayIdentity: identity };
  }
  return {
    async project(value, owner) {
      if (owner !== ownerSeen) clear();
      if (!current(owner)) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
      const result = clone(value), values = documents(result); await Promise.all([ensure(owner, values), ensureTerritories(owner, values)]);
      if (!current(owner)) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
      for (const document of values) {
        document.player = participantView(owner, document.player, document, 'player');
        document.enemy = participantView(owner, document.enemy, document, 'enemy');
      }
      return result;
    },
    dispose() { disposed = true; clear(); for (const dispose of disposers) dispose(); for (const task of queue.splice(0)) task.done(); }
  };
}
module.exports = { createBattleDisplayViews, checkedMetadata, friendRoom };
