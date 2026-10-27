import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationSettingsPage } from '../../../apps/pc-app/ui/src/features/conversations/settings-page';

// Actual source components with a controlled in-memory record/CAS boundary.
// No Electron profile, model, account, SQL or network access.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.lingjing = { subscribe: () => () => {}, invoke: () => { throw Error('Unexpected desktop IPC'); } };
const clone = value => structuredClone(value);
const check = (value, message) => { if (!value) throw Error(message); };
let root, host, fixture;
const profile = persona => ({ persona, replyStyle: 'natural', memoryEnabled: true, pauseWhileChatting: true, useOverride: false, revision: 1 });
const connection = model => ({ provider: 'openai_compatible', baseUrl: 'https://example.invalid/v1', model, contextChars: 24000, maxOutputTokens: 512, revision: 1, hasKey: false });
function makeFixture() {
  const listeners = new Set(), sessions = new Set(), calls = [];
  let snapshot = { accountId: 'fixture-owner-a', sessionRevision: 1, petId: 'fixture-pet-a',
    pets: [{ petId: 'fixture-pet-a', name: 'fixture pet', templateId: null, avatarUrl: null, level: 1 }],
    summaries: {}, profile: profile('saved persona v1'), globalConnection: connection('saved-model-v1'), connection: null,
    secureStorageAvailable: true, memories: [], messages: [] };
  const client = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onSessionChanged(listener) { sessions.add(listener); return () => sessions.delete(listener); },
    async invoke(command, input = {}) {
      calls.push({ command, input: clone(input) });
      if (command === 'snapshot') return { ok: true, data: clone(snapshot) };
      if (command === 'profile.save') {
        if (input.revision !== snapshot.profile.revision) return { ok: false, code: 'PROFILE_CONFLICT', message: '这条人设已更新，请核对草稿。' };
        snapshot.profile = { ...clone(input.profile), revision: snapshot.profile.revision + 1 };
        return { ok: true, data: clone(snapshot.profile) };
      }
      if (command === 'connection.save') {
        if (input.revision !== snapshot.globalConnection.revision) return { ok: false, code: 'CONNECTION_CONFLICT', message: '这条连接已更新，请核对草稿。' };
        snapshot.globalConnection = { ...clone(input.connection), hasKey: Boolean(input.apiKey), revision: snapshot.globalConnection.revision + 1 };
        return { ok: true, data: clone(snapshot.globalConnection) };
      }
      throw Error(`Unexpected fixture command: ${command}`);
    }
  };
  return { client, calls, snapshot: () => clone(snapshot),
    changeProfile() { snapshot.profile = { ...snapshot.profile, persona: 'remote persona v2', revision: 2 }; },
    changeConnection() { snapshot.globalConnection = { ...snapshot.globalConnection, model: 'remote-model-v2', revision: 2 }; },
    notify() { for (const fn of listeners) fn({ type: 'changed', accountId: snapshot.accountId, petId: snapshot.petId }); },
    switchPet() { snapshot = { ...snapshot, petId: "fixture-pet-c", pets: [{petId:"fixture-pet-c",name:"third pet",level:1}], profile:profile("third pet persona") }; for(const fn of listeners) fn({type:"changed",accountId:snapshot.accountId}); },
    switchSession() { snapshot = { ...snapshot, accountId: 'fixture-owner-b', sessionRevision: 2, petId: 'fixture-pet-b',
      pets: [{ petId: 'fixture-pet-b', name: 'other fixture pet', templateId: null, avatarUrl: null, level: 1 }],
      profile: profile('other owner persona'), globalConnection: connection('other-owner-model') }; for (const fn of sessions) fn(); }
  };
}
async function mount() {
  fixture = makeFixture(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(createElement(ConversationSettingsPage, { client: fixture.client })); });
  check(persona(), 'Actual persona form not mounted');
}
async function cleanup() { await act(async () => { root?.unmount(); }); host?.remove(); root = null; }
const persona = () => host.querySelector('textarea[aria-label="性格设定"]');
const model = () => host.querySelector('input[placeholder="模型 ID"]');
const secret = () => host.querySelector('input[type="password"]');
async function input(element, value) {
  check(element && !element.disabled, 'Editable source field required');
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const step = work => act(async () => { work(); });
const submit = element => step(() => element.closest('form').requestSubmit());
const warning = () => check(/更新|草稿/.test(host.textContent), 'A remote update must warn while a draft remains');
const cases = [
  ['normal saves advance the baseline and allow another save without stale revision', async () => {
    await input(persona(), 'saved new persona'); await submit(persona());
    check(fixture.snapshot().profile.persona === 'saved new persona', 'Persona did not save');
    await input(persona(), 'saved again'); await submit(persona());
    check(fixture.calls.filter(x=>x.command==='profile.save').at(-1).input.revision === 2, 'Persona baseline not advanced');
    await input(model(), 'new-model'); await input(secret(), 'fixture-only-secret'); await submit(model());
    check(secret().value === '', 'Saved secret remained in input');
    await input(model(), 'newer-model'); await submit(model());
    check(fixture.calls.filter(x=>x.command==='connection.save').at(-1).input.revision === 2, 'Connection baseline not advanced');
  }],
  ['unchanged notification retains dirty drafts without a false remote warning', async () => {
    await input(persona(), 'draft'); await input(model(), 'draft-model'); await step(()=>fixture.notify());
    check(persona().value === 'draft' && model().value === 'draft-model', 'Unchanged notification changed draft');
    check(!host.textContent.includes('另一端已更新'), 'Unchanged notification showed conflict warning');
  }],
  ['explicit discard adopts remote versions and clears connection secret', async () => {
    await input(persona(),'draft'); await input(model(),'draft-model'); await input(secret(),'fixture-only-secret');
    await step(()=>{fixture.changeProfile();fixture.changeConnection();fixture.notify();});
    for(const label of ['放弃草稿并载入最新人设','放弃草稿并载入最新连接']) {
      const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label);check(button,'Missing explicit discard');await step(()=>button.click());
    }
    check(persona().value==='remote persona v2' && model().value==='remote-model-v2' && secret().value==='', 'Discard did not load remote or clear secret');
    await input(persona(),'new draft');await submit(persona());check(fixture.calls.filter(x=>x.command==='profile.save').at(-1).input.revision===2,'Discard baseline stale');
  }],
  ['pet scope change clears private drafts and unsaved global key', async()=>{
    await input(persona(),'private old pet');await input(secret(),'fixture-only-secret');await step(()=>fixture.switchPet());
    check(persona().value==='third pet persona' && secret().value==='', 'Pet scope retained old draft or secret');
  }],
  ['dirty persona survives a newer remote version without an implicit save', async () => {
    await input(persona(), 'unsaved local persona');
    await step(() => { fixture.changeProfile(); fixture.notify(); });
    check(persona().value === 'unsaved local persona', 'Remote refresh silently replaced unsaved persona');
    warning(); check(!fixture.calls.some(x => x.command === 'profile.save'), 'A refresh submitted the draft');
  }],
  ['stale persona save uses its original edit revision and retains the rejected draft', async () => {
    await input(persona(), 'unsaved local persona');
    await step(() => { fixture.changeProfile(); fixture.notify(); });
    await submit(persona());
    const save = fixture.calls.find(x => x.command === 'profile.save');
    check(save?.input.revision === 1, 'Stale draft used the newer unseen revision');
    check(fixture.snapshot().profile.persona === 'remote persona v2', 'Stale save overwrote remote persona');
    check(persona().value === 'unsaved local persona', 'Rejected persona draft was lost'); warning();
  }],
  ['a clean persona form adopts a newer remote version', async () => {
    await step(() => { fixture.changeProfile(); fixture.notify(); });
    check(persona().value === 'remote persona v2', 'Clean form failed to adopt remote content');
  }],
  ['dirty connection and unsaved secret survive refresh and keep their original CAS revision', async () => {
    await input(model(), 'unsaved-local-model'); await input(secret(), 'fixture-only-secret');
    await step(() => { fixture.changeConnection(); fixture.notify(); });
    check(model().value === 'unsaved-local-model', 'Remote refresh silently replaced connection draft');
    check(secret().value === 'fixture-only-secret', 'Remote refresh silently discarded secret input'); warning();
    await submit(model()); const save = fixture.calls.find(x => x.command === 'connection.save');
    check(save?.input.revision === 1, 'Stale connection used the newer unseen revision');
    check(fixture.snapshot().globalConnection.model === 'remote-model-v2', 'Stale connection overwrote remote content');
    check(model().value === 'unsaved-local-model' && secret().value === 'fixture-only-secret', 'Rejected connection draft was discarded');
  }],
  ['changing account/session removes the previous persona draft and secret input', async () => {
    await input(persona(), 'previous owner draft'); await input(secret(), 'fixture-only-secret');
    await step(() => fixture.switchSession());
    check(persona().value === 'other owner persona', 'Previous owner persona survived session switch');
    check(model().value === 'other-owner-model' && secret().value === '', 'Previous owner connection/secret crossed session scope');
    check(!host.textContent.includes('previous owner draft'), 'Previous private draft remains visible');
  }]
];
window.runHookRegressions = async () => {
  const result = [];
  for (const [name, run] of cases) {
    try { await mount(); await run(); result.push({ name, passed: true }); }
    catch (error) { result.push({ name, passed: false, error: error.stack || String(error), causes: error.errors?.map(e => e.stack || String(e)) }); }
    finally { await cleanup(); }
  }
  return result;
};
