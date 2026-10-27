import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppVersion, AboutPage } from '../../../apps/pc-app/ui/src/features/accounts/about';
const wait = () => new Promise(resolve => setTimeout(resolve, 30));
const info = { version: 'fixture-7.2', platform: 'win32', runtime: { arch:'x64', electron:'44', node:'24' }, build:{ sourceCommit:'fixture-commit-123',codeFingerprint:'source-hash',compiledFingerprint:'compiled-hash' }, support:{ executablePath:'C:\\Apps\\Lingjing.exe',logsPath:'C:\\Logs',logsAvailable:true,automaticUpdates:false } };
window.runAboutRegressions = async () => {
  const calls = [], results = []; let fail = false;
  window.lingjing = { invoke: async (feature,command,payload) => { calls.push({feature,command,payload}); return fail ? {ok:false,message:'fixture runtime unavailable'} : {ok:true,data:command==='info'?info:{opened:true}}; } };
  async function run(name, component, check) { const host=document.createElement('div');document.body.append(host);const root=createRoot(host); try {root.render(createElement(component));await wait();await check(host);results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}finally{root.unmount();host.remove();} }
  const check=(condition,message)=>{if(!condition)throw Error(message)};
  await run('signed-out version uses public runtime version and build rather than hardcoded package',AppVersion,host=>{check(host.textContent.includes('fixture-7.2'),'runtime version absent');check(host.textContent.includes('fixture-comm'),'build absent');check(host.querySelector('a').getAttribute('href')==='#/settings/about','about entry missing')});
  await run('about reports no automatic update service and fixed host actions',AboutPage,async host=>{check(host.textContent.includes('没有配置官方下载地址或自动更新服务'),'update boundary missing');check(host.textContent.includes('C:\\Apps\\Lingjing.exe'),'stable executable absent');const button=[...host.querySelectorAll('button')].find(x=>x.textContent==='打开本地日志目录');button.click();await wait();check(calls.some(c=>c.command==='openLogs'&&c.payload===undefined),'fixed logs command not invoked')});
  fail=true; await run('app info failure is visible and never invented as a version',AppVersion,host=>{check(host.textContent.includes('fixture runtime unavailable'),'failure hidden');check(!host.textContent.includes('fixture-7.2'),'stale version fabricated')});
  return results;
};
