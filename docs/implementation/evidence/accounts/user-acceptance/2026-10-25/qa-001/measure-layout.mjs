import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {chromium} from 'playwright';
const workspace=process.cwd(),directory=path.resolve('artifacts/accounts/qa001-layout'),ui=path.join(workspace,'apps/pc-app/ui/src').replaceAll('\\','/');
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
fs.writeFileSync(path.join(directory,'fixture.tsx'),`
import {createRoot} from 'react-dom/client';
import {AuthPage} from ${JSON.stringify(ui+'/features/accounts/auth.tsx')};
import ${JSON.stringify(ui+'/styles/global.css')};
import ${JSON.stringify(ui+'/styles/layout.css')};
import ${JSON.stringify(ui+'/features/accounts/styles.css')};
const query=new URLSearchParams(location.search);
const session={currentUser:null,defaultProvider:'runtime',dataMode:'live',secureStorageAvailable:query.get('secure')!=='0',persistence:'none',migration:{status:'none',imported:0,unresolved:[]},startupIssue:null};
window.lingjing={invoke:async()=>({ok:false,message:'布局检查模拟错误：'+('无法连接服务器，请检查网络。').repeat(12)+'NetworkError'+('x'.repeat(80))})};
createRoot(document.getElementById('root')!).render(<main style={{padding:16,overflow:'auto',height:'100vh'}}><AuthPage session={session} onSignedIn={async()=>{}}/></main>);
`);
const server=await createServer({configFile:false,root:directory,publicDir:path.join(workspace,'apps/pc-app/ui/.generated-public'),plugins:[react(),tailwind()],resolve:{alias:{'@':ui}},server:{host:'127.0.0.1',port:0,fs:{allow:[workspace]}}});
const report={at:new Date().toISOString(),scope:'Isolated headless rendering of production AuthPage, Radix controls and actual global/account CSS. Simulated account IPC only; no desktop, real account, vault or OS DPI changes. Not user/SFX acceptance.',cases:[],errors:[]};
let browser;
try{
 await server.listen();const address=server.httpServer.address(),url=`http://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const sample of [{width:1280,scale:1},{width:1280,scale:1.25},{width:1024,scale:1.5},{width:800,scale:1.25},{width:640,scale:1.5},{width:360,scale:2}]){
  const context=await browser.newContext({viewport:{width:sample.width,height:920},deviceScaleFactor:sample.scale});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(url);await page.getByRole('checkbox',{name:'保持登录',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const mode of ['login','register']){
   if(mode==='register')await page.getByRole('tab',{name:'注册',exact:true}).click();
   for(const provider of ['runtime','local']){
    await page.getByRole('combobox',{name:'账号类型',exact:true}).click();await page.getByRole('option',{name:provider==='local'?'本机账号':'云端账号',exact:true}).click();
    const measure=await page.evaluate(()=>{
     const rect=node=>{const {x,y,width,height}=node.getBoundingClientRect();return{x,y,width,height,cx:x+width/2,cy:y+height/2};};
     const keep=document.querySelector('.ac-login-preference'),label=keep.querySelector('label'),remember=document.querySelector('.ac-auth-preferences>label');
     const checkbox=rect(label.querySelector('[role=checkbox]')),text=rect(label.querySelector('span')),badge=rect(keep.querySelector('.ac-status-badge')),icon=rect(keep.querySelector('.ac-status-badge svg'));
     const passwordButton=rect(document.querySelector('.ac-password button')),passwordIcon=rect(document.querySelector('.ac-password button svg'));
     const card=document.querySelector('.ac-auth-card'),field=document.querySelector('fieldset');
     return{checkbox,text,badge,icon,centerSpread:Math.max(checkbox.cy,text.cy,badge.cy,icon.cy)-Math.min(checkbox.cy,text.cy,badge.cy,icon.cy),rememberCenterSpread:Math.abs(rect(remember.querySelector('[role=checkbox]')).cy-rect(remember.querySelector('span')).cy),passwordCenterSpread:Math.abs(passwordButton.cy-passwordIcon.cy),cardOverflow:card.scrollWidth-card.clientWidth,fieldOverflow:field.scrollWidth-field.clientWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth,captionHeight:rect(document.querySelector('.ac-field-caption')).height};
    });
    assert.ok(measure.centerSpread<=.5,JSON.stringify({sample,mode,provider,measure}));assert.ok(measure.rememberCenterSpread<=.5);assert.ok(measure.passwordCenterSpread<=.5);
    assert.equal(measure.badge.width,24);assert.equal(measure.badge.height,24);assert.equal(measure.checkbox.width,16);assert.equal(measure.checkbox.height,16);
    for(const key of ['cardOverflow','fieldOverflow','documentOverflow'])assert.ok(measure[key]<=1,`${key}: ${JSON.stringify({sample,mode,provider,measure})}`);
    report.cases.push({sample,mode,provider,measure});
   }
  }
  const remember=page.getByRole('checkbox',{name:'记住账号',exact:true});await remember.check();assert.equal(await remember.getAttribute('data-state'),'checked');
  await page.getByRole('button',{name:'显示密码',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'密码',exact:true}).getAttribute('type'),'text');
  await page.getByRole('button',{name:'隐藏密码',exact:true}).click();
  await page.getByRole('textbox',{name:'用户名',exact:true}).fill('布局检查');await page.getByRole('textbox',{name:'账号',exact:true}).fill('layout_user');
  await page.getByLabel('密码',{exact:true}).fill('example123');await page.getByLabel('确认密码',{exact:true}).fill('example123');await page.getByRole('button',{name:'创建账号 →',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'布局检查模拟错误'}).waitFor();
  const error=await page.getByRole('alert').evaluate(node=>({height:node.getBoundingClientRect().height,overflow:node.scrollWidth-node.clientWidth}));assert.ok(error.height>20);assert.ok(error.overflow<=1);report.cases.push({sample,mode:'long-error',error});
  if([1280,640,360].includes(sample.width)&&sample.scale!==1.25){await page.screenshot({path:path.join(directory,`register-error-${sample.width}-${sample.scale}.png`),fullPage:true});}
  await page.goto(url+'?secure=0');assert.equal(await page.getByRole('checkbox',{name:'保持登录',exact:true}).isDisabled(),true);
  await context.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.passed=false;report.failure={message:error.message,stack:error.stack};throw error;}
finally{fs.writeFileSync(path.join(directory,'layout.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors,failure:report.failure?.message,directory}));}
