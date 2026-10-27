import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountPage } from '../../../apps/pc-app/ui/src/features/accounts/account';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const check = (value, message) => { if (!value) throw Error(message); };
let root, host, fixture;
function setup() {
  let owner = 'restore-ui-owner-a', preview = 0, loseNext = true;
  const listeners = new Map(), calls = [];
  const user = () => ({id:owner, account:owner, username:owner, provider:'runtime', authKind:'supabase', revision:1});
  window.lingjing = {
    subscribe(name, fn) { if (!listeners.has(name)) listeners.set(name,new Set()); listeners.get(name).add(fn); return () => listeners.get(name).delete(fn); },
    async invoke(feature, command, payload) {
      check(feature === 'accounts', 'Only in-memory account IPC is permitted');
      calls.push({owner, command, payload:structuredClone(payload)});
      const ok = data => ({ok:true,data});
      if(command === 'session') return ok({currentUser:user(), persistence:'memory'});
      if(command === 'syncStatus') return ok({mode:'cloud-authority',status:'ready',pending:0,conflicts:0,domainStates:[]});
      if(command === 'settingsGet') return ok({revision:1,document:{sync:{enabled:true},desktop:{}}});
      if(command === 'backupPreview') return ok({previewId:`fixture-preview-${++preview}`, createdAt:'2026-10-27T00:00:00Z',modules:['conversations']});
      if(command === 'backupRestore') {
        if(loseNext){loseNext=false;return {ok:false,code:'RECORD_UNAVAILABLE',message:'Fixture lost receipt; original import may have completed'};}
        return ok({preservedBackup:{filePath:'fixture-only-no-file'}});
      }
      throw Error(`Unexpected IPC command ${command}`);
    }
  };
  return {calls, lose(){loseNext=true;}, switchOwner(){owner='restore-ui-owner-b';for(const fn of listeners.get('app:session')||[])fn();}};
}
const button = label => [...document.querySelectorAll('button')].find(element=>element.textContent.trim()===label);
async function click(label){const element=button(label);check(element&&!element.disabled,`Missing enabled button ${label}`);await act(async()=>{element.click();});}
async function mount(){fixture=setup();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(AccountPage));});check(button('导入旧备份'),'Actual account page did not mount');}
async function cleanup(){await act(async()=>root?.unmount());host?.remove();root=null;}
const restores=()=>fixture.calls.filter(x=>x.command==='backupRestore');
const cases=[
  ['lost receipt retries the same action, preview and mode; success allows a distinct new import',async()=>{
    await click('导入旧备份');await click('确认导入');
    check(document.body.textContent.includes('Fixture lost receipt'),'Retry error must remain visible');
    check(button('确认导入'),'Failed import must retain its confirmation');
    await click('确认导入');
    check(restores().length===2,'Exactly two explicit attempts expected');
    check(JSON.stringify(restores()[0].payload)===JSON.stringify(restores()[1].payload),'A receipt-loss retry changed action identity or input');
    check(!button('确认导入'),'Successful import must close confirmation');
    await click('导入旧备份');await click('确认导入');
    check(restores().length===3,'A new confirmed import should run once');
    check(restores()[2].payload.actionId!==restores()[0].payload.actionId,'A new import reused the completed intent');
    check(restores()[2].payload.previewId!==restores()[0].payload.previewId,'Fixture must supply a fresh preview');
  }],
  ['switching account clears an uncertain restore intent and its preview',async()=>{
    await click('导入旧备份');await click('确认导入');const old=restores()[0];
    await act(async()=>fixture.switchOwner());
    check(!button('确认导入'),'Previous account restore preview crossed owner boundary');
    await click('导入旧备份');await click('确认导入');const next=restores()[1];
    check(next.owner!==old.owner,'Fixture must switch account');
    check(next.payload.actionId!==old.payload.actionId,'Previous account restore intent crossed owner boundary');
    check(next.payload.previewId!==old.payload.previewId,'Previous account preview crossed owner boundary');
  }]
];
window.runHookRegressions=async()=>{const results=[];for(const [name,run] of cases){try{await mount();await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.stack||String(error),causes:error.errors?.map(e=>e.stack||String(e))});}finally{await cleanup();}}return results;};
