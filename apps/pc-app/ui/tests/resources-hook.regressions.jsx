import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useResources } from '../src/features/resources/useResources';
import { resourcesClient } from '../src/features/resources/client';

// Real React/DOM hook regression with a controlled in-memory IPC boundary.
// No Electron app, live account, cloud, SQLite or native acceptance is involved.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const clone = value => structuredClone(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const scale = resource => resource?.calibration.desktop.scale;
const target = 'original-resource', other = 'other-resource', ownerA = 'owner-a', ownerB = 'owner-b';
function resource(id, revision = 1, size = 1.05) {
  const calibration = { scale: size, anchorX: 0.5, anchorY: 0.85, verticalOffset: 0, rotationDeg: 0, mirrorX: true, fps: 8 };
  return { id, name: id, kind: 'spritesheet', origin: 'import', revision, contentHash: 'a'.repeat(64), importedAt: '2026-10-25T00:00:00.000Z',
    provenance: { status: 'user-import', author: 'fixture' }, entryAsset: 'character.json', sheet: { width: 64, height: 64, columns: 1, rows: 1 },
    clips: [{ name: 'idle', frames: [0], fps: 8, loop: true }], actions: { idle: 'idle', walk: 'idle' },
    calibration: { desktop: clone(calibration), battle: clone(calibration) }, availability: 'ready', warnings: [] };
}
let latest, root, host, fixture;
function Harness() { latest = useResources(resourcesClient); return null; }
function makeFixture(options = {}) {
  const data = new Map([[ownerA, [resource(target), resource(other)]], [ownerB, [resource('b-resource')]]]);
  const listeners = new Map(), holds = new Map(), pending = new Map(), calls = [];
  let owner = ownerA, imported = 0;
  const send = (name, payload) => { for (const listener of [...listeners.get(name) || []]) listener(clone(payload)); };
  const defer = (kind, reply) => {
    if (!(holds.get(kind) > 0)) return Promise.resolve(clone(reply));
    holds.set(kind, holds.get(kind) - 1);
    return new Promise(resolve => { if (!pending.has(kind)) pending.set(kind, []); pending.get(kind).push(() => resolve(clone(reply))); });
  };
  const hold = kind => holds.set(kind, (holds.get(kind) || 0) + 1);
  const session = who => ({ currentUser: who ? { id: who, ownerAccountId: who } : null });
  const invoke = (feature, command, input = {}) => {
    const who = owner; calls.push({ feature, command, owner: who, input: clone(input) });
    if (feature === 'accounts' && command === 'session') return defer('session', { ok: true, data: session(who) });
    if (feature !== 'resources') throw new Error('Unexpected fixture call');
    if (command === 'list') return defer('list', { ok: true, data: data.get(who) || [] });
    if (command === 'save') {
      const rows = data.get(who), current = rows?.find(item => item.id === input.resourceId);
      if (!current || current.revision !== input.expectedRevision) return defer('save', { ok: false, code: 'REVISION_CONFLICT', message: '设置已在另一窗口更新，请重新载入后保存' });
      const saved = { ...current, revision: current.revision + 1, calibration: clone(input.calibration), actions: clone(input.actions) };
      data.set(who, rows.map(item => item.id === saved.id ? saved : item)); send('resources:changed', { ownerAccountId: who, resourceId: saved.id, revision: saved.revision });
      return defer('save', { ok: true, data: saved });
    }
    if (command === 'import') {
      const added = resource(`imported-${++imported}`, 0); data.set(who, [...data.get(who), added]);
      send('resources:changed', { ownerAccountId: who, resourceId: added.id, revision: 0 });
      return defer('import', { ok: true, data: { resource: added, duplicate: false } });
    }
    throw new Error(`Unexpected resources command ${command}`);
  };
  window.lingjing = { invoke, call: invoke, subscribe(name, listener) {
    if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener);
    return () => listeners.get(name).delete(listener);
  }, window: { minimize() {}, maximize() {}, close() {} } };
  if (options.holdSession) hold('session');
  return { data, calls, hold, send, session, count: command => calls.filter(call => call.command === command).length,
    release(kind) { const next = pending.get(kind)?.shift(); check(next, `No held ${kind} reply`); next(); },
    releaseAll() { for (const queue of pending.values()) for (const next of queue.splice(0)) next(); },
    owner(who) { owner = who; send('accounts:session-changed', session(who)); },
    change(id, edit, who = owner) { data.set(who, data.get(who).map(item => item.id === id ? edit(clone(item)) : item)); },
    notify(id = target, who = owner) { send('resources:changed', { ownerAccountId: who, resourceId: id }); },
    listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); } };
}
async function mount(options) {
  latest = null; fixture = makeFixture(options); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(createElement(Harness)); });
}
async function cleanup() {
  await act(async () => { root?.unmount(); fixture?.releaseAll(); }); root = null; host?.remove();
}
const step = work => act(async () => { work(); });
const edit = async (size = 1.06) => step(() => { const next = clone(latest.draft); next.calibration.desktop.scale = size; latest.edit(next); });
const notify = async (id, who) => step(() => fixture.notify(id, who));
const save = async () => act(async () => { await latest.save(); });
const noWarning = () => check(!/已更新/.test(latest.message), `Unexpected update warning: ${latest.message}`);
const warning = () => check(/已更新/.test(latest.message), 'A real saved-baseline change must still warn');
const retained = draft => { check(latest.dirty, 'Dirty flag cleared'); check(latest.draft === draft, 'Draft object replaced'); check(scale(latest.draft) === 1.06, 'Draft calibration overwritten'); };
const cases = [
  ['1: repeated same-version/document notifications preserve selection identity and dirty draft', async () => {
    await edit(); const draft = latest.draft, selected = latest.resources.find(item => item.id === target);
    await notify(); await notify(); retained(draft); noWarning();
    check(latest.resources.find(item => item.id === target) === selected, 'Unchanged selected list object replaced');
    check(fixture.count('save') === 0, 'A notification issued a save');
  }],
  ['2: another resource changes without warning or clearing the selected dirty draft', async () => {
    await edit(); const draft = latest.draft, selected = latest.resources.find(item => item.id === target);
    fixture.change(other, item => ({ ...item, revision: 2 })); await notify(other); retained(draft); noWarning();
    check(latest.resources.find(item => item.id === other).revision === 2, 'Other library entry not refreshed');
    check(latest.resources.find(item => item.id === target) === selected, 'Unchanged selected object replaced');
  }],
  ['3: actual same-resource document change retains draft and CAS rejection; discard adopts latest baseline', async () => {
    await edit(); const draft = latest.draft;
    fixture.change(target, item => ({ ...item, revision: 2, calibration: { ...item.calibration, desktop: { ...item.calibration.desktop, scale: 1.12 } } }));
    await notify(); retained(draft); warning(); await save(); retained(draft);
    check(fixture.data.get(ownerA)[0].revision === 2 && scale(fixture.data.get(ownerA)[0]) === 1.12, 'Stale save overwrote persisted baseline');
    await step(() => latest.discard()); check(!latest.dirty && latest.draft.revision === 2 && scale(latest.draft) === 1.12, 'Discard failed to adopt latest saved baseline');
  }],
  ['4: a higher revision with identical document remains a real stale-CAS warning', async () => {
    await edit(); const draft = latest.draft; fixture.change(target, item => ({ ...item, revision: 2 })); await notify(); retained(draft); warning();
    await save(); check(fixture.data.get(ownerA)[0].revision === 2, 'Identical-document revision bypassed CAS'); retained(draft);
  }],
  ['5: descriptor and availability changes at the same revision retain draft and warn', async () => {
    await edit(); const draft = latest.draft;
    fixture.change(target, item => ({ ...item, contentHash: 'b'.repeat(64), availability: 'missing', warnings: ['fixture file missing'] }));
    await notify(); retained(draft); warning(); check(latest.resources[0].availability === 'missing', 'Availability not refreshed');
  }],
  ['6: removal retains the dirty draft until explicit discard, without resurrecting the resource', async () => {
    await edit(); const draft = latest.draft; fixture.data.set(ownerA, [resource(other)]); await notify(); retained(draft); warning();
    check(!latest.resources.some(item => item.id === target), 'Removed resource resurrected in library');
    await step(() => latest.discard()); check(latest.selectedId === other && !latest.dirty, 'Discard did not leave removed resource');
  }],
  ['7: starting an edit while a list reply is pending does not lose that edit', async () => {
    fixture.hold('list'); await notify(); await edit(); const draft = latest.draft;
    await step(() => fixture.release('list')); retained(draft); noWarning(); check(!latest.loading, 'Loading stuck after a completed reply');
  }],
  ['8: a selection change invalidates an old pending list reply', async () => {
    fixture.hold('list'); await notify(); await step(() => latest.choose(latest.resources.find(item => item.id === other))); const draft = latest.draft;
    await step(() => fixture.release('list')); check(latest.selectedId === other && latest.draft === draft, 'Late reply reverted selection'); check(!latest.loading, 'Selection change left loading active');
  }],
  ['9: an old list reply cannot overwrite the result of a single successful save', async () => {
    fixture.hold('list'); await notify(); await edit(); await save();
    check(!latest.dirty && latest.draft.revision === 2 && scale(latest.draft) === 1.06, 'Own save did not commit');
    await step(() => fixture.release('list')); check(!latest.dirty && latest.draft.revision === 2 && scale(latest.draft) === 1.06, 'Old list reply overwrote own save');
    check(fixture.count('save') === 1, 'Save was duplicated'); noWarning();
  }],
  ['10: changes during a held save are coalesced into a post-save refresh', async () => {
    await edit(); fixture.hold('save'); let work; await step(() => { work = latest.save(); }); const lists = fixture.count('list');
    fixture.change(other, item => ({ ...item, revision: 3 })); await notify(other); check(fixture.count('list') === lists, 'Read ran in the middle of an owned operation');
    await act(async () => { fixture.release('save'); await work; });
    check(latest.operation === null && !latest.dirty && latest.draft.revision === 2, 'Held own save failed');
    check(latest.resources.find(item => item.id === other).revision === 3, 'Notification during save was lost'); noWarning(); check(fixture.count('save') === 1, 'Held save duplicated');
  }],
  ['11: owner switch rejects old reads and old-owner events', async () => {
    fixture.hold('list'); await notify(); await step(() => fixture.owner(ownerB));
    check(latest.selectedId === 'b-resource', 'New owner was not loaded'); const draft = latest.draft;
    await step(() => fixture.release('list')); check(latest.selectedId === 'b-resource' && latest.draft === draft, 'Old owner reply contaminated new owner');
    const lists = fixture.count('list'); await notify(target, ownerA); check(fixture.count('list') === lists, 'Old owner event triggered a new-owner reload');
  }],
  ['12: an old-owner save completion cannot clear or overwrite a newer owned operation', async () => {
    await edit(); fixture.hold('save'); let oldWork; await step(() => { oldWork = latest.save(); });
    await step(() => fixture.owner(ownerB)); check(latest.selectedId === 'b-resource', 'New owner not selected');
    await edit(1.15); fixture.hold('save'); let newWork; await step(() => { newWork = latest.save(); });
    await act(async () => { fixture.release('save'); await oldWork; });
    check(latest.operation === 'save' && latest.selectedId === 'b-resource' && scale(latest.draft) === 1.15, 'Old completion affected the new operation');
    await act(async () => { fixture.release('save'); await newWork; });
    check(latest.operation === null && latest.selectedId === 'b-resource' && latest.draft.revision === 2 && !latest.dirty, 'New owned save failed');
  }],
  ['13: a session event supersedes an older initial owner lookup', async () => {
    // This test mounts separately so the initial public-session response can be held.
    await cleanup(); await mount({ holdSession: true }); await step(() => fixture.owner(ownerB));
    check(latest.selectedId === 'b-resource', 'Session event did not establish new owner');
    await step(() => fixture.release('session')); check(latest.selectedId === 'b-resource', 'Old initial session lookup replaced new owner');
  }],
  ['14: own import selects the imported resource; an old-owner import result is ignored', async () => {
    await act(async () => { await latest.importResource({ author: 'fixture' }); });
    check(latest.selectedId === 'imported-1' && !latest.dirty && !latest.loading, 'Own import selection did not finish');
    fixture.hold('import'); let work; await step(() => { work = latest.importResource({ author: 'fixture' }); });
    await step(() => fixture.owner(ownerB)); await act(async () => { fixture.release('import'); await work; });
    check(latest.selectedId === 'b-resource' && latest.operation === null, 'Old import contaminated the new owner');
  }],
  ['15: later replies win over older list snapshots; unmount removes subscriptions', async () => {
    fixture.hold('list'); await notify(); fixture.change(target, item => ({ ...item, revision: 2 })); await notify();
    check(latest.draft.revision === 2, 'Newer clean list did not apply'); await step(() => fixture.release('list'));
    check(latest.draft.revision === 2, 'Older list snapshot downgraded the view');
    fixture.hold('list'); await notify(); await act(async () => { root.unmount(); }); root = null;
    check(fixture.listenerCount() === 0, 'Unmount leaked event subscriptions'); await step(() => fixture.release('list'));
  }],
  ['16: repeated same-owner session events preserve a held save lock, draft and successful result', async () => {
    await edit(); const draft = latest.draft; fixture.hold('save'); let work; await step(() => { work = latest.save(); });
    const reads = fixture.count('list');
    for (let n = 0; n < 3; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    check(latest.operation === 'save', 'Same-owner event released the save lock'); retained(draft);
    check(fixture.count('list') === reads, 'Same-owner event read through an active save');
    await step(() => { void latest.save(); }); check(fixture.count('save') === 1, 'Second save entered before the held save completed');
    await act(async () => { fixture.release('save'); await work; });
    check(latest.operation === null && !latest.dirty && latest.draft.revision === 2 && scale(latest.draft) === 1.06, 'Same-owner events discarded the successful save');
    check(fixture.count('list') === reads + 1, 'Same-owner refreshes were not coalesced after save'); noWarning();
  }],
  ['17: repeated same-owner session events preserve a held import lock and select its single result', async () => {
    fixture.hold('import'); let work; await step(() => { work = latest.importResource({ author: 'fixture' }); });
    const draft = latest.draft, reads = fixture.count('list');
    for (let n = 0; n < 3; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    check(latest.operation === 'import' && latest.draft === draft, 'Same-owner event cancelled the import scope');
    check(fixture.count('list') === reads, 'Same-owner refresh ran before import completion');
    await step(() => { void latest.importResource({ author: 'duplicate-attempt' }); }); check(fixture.count('import') === 1, 'Second import entered before completion');
    await act(async () => { fixture.release('import'); await work; });
    check(latest.operation === null && latest.selectedId === 'imported-1' && !latest.dirty && !latest.loading, 'Successful import result was discarded');
    check(fixture.count('import') === 1 && fixture.data.get(ownerA).filter(item => item.id.startsWith('imported-')).length === 1, 'Import was duplicated'); noWarning();
  }],
  ['18: an old initial owner lookup and repeated same-owner events cannot cancel a held save', async () => {
    await cleanup(); await mount({ holdSession: true }); await step(() => fixture.owner(ownerA)); await edit();
    fixture.hold('save'); let work; await step(() => { work = latest.save(); }); const reads = fixture.count('list');
    await step(() => fixture.release('session'));
    check(latest.operation === 'save', 'Old initial lookup invalidated the established save');
    for (let n = 0; n < 2; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    check(latest.operation === 'save' && fixture.count('list') === reads, 'Same-owner event replaced the scope after an old lookup');
    await act(async () => { fixture.release('save'); await work; });
    check(!latest.dirty && latest.draft.revision === 2 && scale(latest.draft) === 1.06 && fixture.count('save') === 1, 'Interleaved owner lookup lost the single successful save'); noWarning();
  }],
  ['19: an old initial owner lookup and same-owner events cannot cancel a held import', async () => {
    await cleanup(); await mount({ holdSession: true }); await step(() => fixture.owner(ownerA));
    fixture.hold('import'); let work; await step(() => { work = latest.importResource({ author: 'fixture' }); }); const reads = fixture.count('list');
    await step(() => fixture.release('session'));
    for (let n = 0; n < 2; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    check(latest.operation === 'import' && fixture.count('list') === reads, 'Old lookup/same-owner events invalidated the import');
    await act(async () => { fixture.release('import'); await work; });
    check(latest.selectedId === 'imported-1' && latest.operation === null && !latest.loading && fixture.count('import') === 1, 'Interleaved initial lookup discarded import result');
  }],
  ['20: same-owner profile refreshes without an operation preserve a dirty draft and unchanged selection identity', async () => {
    await edit(); const draft = latest.draft, selected = latest.resources.find(item => item.id === target);
    for (let n = 0; n < 3; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    retained(draft); noWarning(); check(latest.resources.find(item => item.id === target) === selected, 'Profile refresh replaced the unchanged selection');
    check(latest.operation === null && fixture.count('save') === 0 && fixture.count('import') === 0, 'Profile refresh started a business operation');
  }],
  ['21: logout still isolates a held save result and does not repopulate the signed-out view', async () => {
    await edit(); fixture.hold('save'); let work; await step(() => { work = latest.save(); }); await step(() => fixture.owner(null));
    check(latest.draft === null && latest.selectedId === '' && latest.operation === null, 'Logout retained the previous owner view/operation');
    await act(async () => { fixture.release('save'); await work; });
    check(latest.draft === null && latest.resources.length === 0 && latest.operation === null && !latest.loading, 'Old save result repopulated the logged-out view');
    await step(() => fixture.owner(ownerB)); check(latest.selectedId === 'b-resource', 'New owner did not load after logout');
  }],
  ['22: same-owner events also preserve the import lock while its required list refresh is held', async () => {
    fixture.hold('list'); let work; await step(() => { work = latest.importResource({ author: 'fixture' }); });
    check(latest.operation === 'import', 'Import completed before its held selection refresh'); const reads = fixture.count('list');
    for (let n = 0; n < 3; n++) await step(() => fixture.send('accounts:session-changed', fixture.session(ownerA)));
    check(latest.operation === 'import' && fixture.count('list') === reads, 'Same-owner event invalidated the import completion refresh');
    await step(() => { void latest.importResource({ author: 'duplicate-attempt' }); }); check(fixture.count('import') === 1, 'Import lock ended before required refresh');
    await act(async () => { fixture.release('list'); await work; });
    check(latest.selectedId === 'imported-1' && !latest.dirty && !latest.loading && latest.operation === null, 'Held import refresh lost the selected result');
  }]
];
window.runHookRegressions = async () => {
  const results = [];
  for (const [name, run] of cases) {
    const start = performance.now();
    try { await mount(); check(latest.draft?.id === target && !latest.loading, 'Initial fixture did not load'); await run(); results.push({ name, passed: true, durationMs: Math.round(performance.now() - start) }); }
    catch (error) { results.push({ name, passed: false, error: error.message, durationMs: Math.round(performance.now() - start) }); }
    finally { await cleanup(); }
  }
  return results;
};
