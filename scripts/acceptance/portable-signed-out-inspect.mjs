// Actual packaged renderer/native-window checks only. Inputs deliberately fail
// native validation or the source-verified password-confirmation guard. No valid
// registration/login is submitted; the immutable preload bridge is untouched.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {pollState} from './poll-state.mjs';
export async function inspectSignedOut({page, output}) {
  const proof={scope:'Actual Windows SFX signed-out UI only; no account creation/login, QA grant, production write or simulated component.',cases:[],validAuthenticationSubmissions:0};
  const runtime=await page.evaluate(()=>window.lingjing.invoke('app','info',{}));assert.equal(runtime.ok,true);
  proof.sourceCommit=runtime.data.build.sourceCommit;proof.compiledFingerprint=runtime.data.build.compiledFingerprint;proof.executablePath=runtime.data.support?.executablePath;
  const initial=await page.evaluate(()=>window.lingjing.invoke('accounts','session',{}));assert.equal(initial.ok,true);assert.equal(initial.data.currentUser,null);
  const file=join(output,'signed-out-evidence.json');
  const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
  const capture=async name=>{await page.screenshot({path:join(output,`${name}.png`),fullPage:true});return `${name}.png`;};
  const run=async(id,coverage,operation)=>{const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await operation());row.status='passed';}catch(error){row.status='failed';row.error=String(error);throw error;}finally{row.completedAt=new Date().toISOString();save();}};
  try {
    const remember=page.getByRole('checkbox',{name:'记住账号',exact:true}),keep=page.getByRole('checkbox',{name:'保持登录',exact:true}),lock=page.getByLabel('登录保护',{exact:true});
    await remember.waitFor();
    await run('A02','exact original signed-out steps',async()=>{
      const geometry=await page.locator('.ac-auth-preferences').evaluate(element=>{
        const center=node=>{const box=node.getBoundingClientRect();return box.y+box.height/2;};
        return [...element.querySelectorAll('.ac-check')].map(label=>({text:label.textContent,checkbox:center(label.querySelector('[role="checkbox"]')),label:center(label.querySelector('span'))}));
      });
      const lockAlignment=await page.locator('.ac-login-preference').evaluate(element=>{const center=node=>{const box=node.getBoundingClientRect();return box.y+box.height/2;};return {label:center(element.querySelector('.ac-check')),icon:center(element.querySelector('.ac-status-badge svg'))};});
      assert.ok(Math.abs(lockAlignment.label-lockAlignment.icon)<=4,'Lock icon/text vertical mismatch');
      for(const row of geometry)assert.ok(Math.abs(row.checkbox-row.label)<=4,`Checkbox/text vertical mismatch: ${row.text}`);
      await remember.focus();assert.equal(await remember.evaluate(node=>node===document.activeElement),true);
      await page.keyboard.press('Space');assert.equal(await remember.getAttribute('aria-checked'),'true');await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      const enabled=!(await keep.isDisabled());
      if(enabled){assert.equal(await keep.evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Space');assert.equal(await keep.getAttribute('aria-checked'),'true');await page.keyboard.press('Space');await page.keyboard.press('Tab');}
      assert.equal(await lock.evaluate(node=>node===document.activeElement),true);
      await page.getByRole('tooltip').waitFor();
      const tooltip=await page.getByRole('tooltip').textContent();assert.ok(tooltip.includes(enabled?'密码不会保存在页面中':'不支持保持登录'));
      const focus=await lock.evaluate(node=>({outline:getComputedStyle(node).outlineStyle,boxShadow:getComputedStyle(node).boxShadow}));
      assert.ok(!['none','hidden'].includes(focus.outline)||focus.boxShadow!=='none','Keyboard focus must be visibly styled');
      const screenshot=await capture('signed-out-A02-focus-lock');
      assert.equal(await remember.getAttribute('aria-checked'),'false');assert.equal(await keep.getAttribute('aria-checked'),'false');
      return {geometry,lockAlignment,secureStorageAvailable:enabled,keyboardReachedLock:true,tooltip,focus,screenshot,visualFocusHumanReviewRequired:true};
    });
    await run('A07','password visibility and keyboard traversal; Enter uses empty-form validation, not authenticated submission',async()=>{
      const password=page.getByLabel('密码',{exact:true});await password.fill('fixture-visible-only');
      await page.getByRole('button',{name:'显示密码',exact:true}).click();assert.equal(await password.getAttribute('type'),'text');assert.equal(await password.inputValue(),'fixture-visible-only');
      await page.getByRole('button',{name:'隐藏密码',exact:true}).click();assert.equal(await password.getAttribute('type'),'password');assert.equal(await password.inputValue(),'fixture-visible-only');await password.fill('');
      await page.getByRole('combobox',{name:'账号类型',exact:true}).focus();const order=[];
      for(let i=0;i<8;i++){await page.keyboard.press('Tab');order.push(await page.evaluate(()=>{const node=document.activeElement;return {tag:node.tagName,role:node.getAttribute('role'),label:node.getAttribute('aria-label'),autocomplete:node.getAttribute('autocomplete'),text:node.textContent?.trim().slice(0,60)};}));}
      assert.equal(order[0].autocomplete,'username');assert.equal(order[1].label,'密码');assert.equal(order[2].label,'显示密码');assert.equal(order[3].label,'记住账号');
      await password.focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('input[autocomplete="username"]').evaluate(node=>node===document.activeElement),true);
      await page.keyboard.press('Enter');assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),false);
      return {order,passwordValuePreserved:true,enterPreventedByConstraint:true,screenshot:await capture('signed-out-A07-empty-enter'),successfulLoginNotTested:true};
    });
    await run('A03','partial: empty login only; invalid account/wrong password require authorized Auth test',async()=>{
      await page.getByRole('button',{name:'登录进入 →',exact:true}).click();
      const invalid=await page.locator('input[autocomplete="username"]').evaluate(node=>({missing:node.validity.valueMissing,message:node.validationMessage}));assert.equal(invalid.missing,true);assert.ok(invalid.message);
      return {invalid,screenshot:await capture('signed-out-A03-empty')};
    });
    await run('A04','partial: short account and mismatched passwords; duplicate account deliberately not submitted',async()=>{
      await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill('测试用户');
      const account=page.locator('input[autocomplete="username"]');await account.fill('');await account.pressSequentially('ab');await page.getByLabel('密码',{exact:true}).fill('fixture-password');await page.getByLabel('确认密码',{exact:true}).fill('fixture-different');
      await page.getByRole('button',{name:'创建账号 →',exact:true}).click();const short=await account.evaluate(node=>({tooShort:node.validity.tooShort,message:node.validationMessage}));assert.equal(short.tooShort,true);
      await account.fill('signed-out-validation-only');await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('alert').filter({hasText:'两次输入的密码不一致'}).waitFor();
      assert.equal(await account.inputValue(),'signed-out-validation-only');const screenshot=await capture('signed-out-A04-mismatch');
      await account.fill('');await page.getByLabel('密码',{exact:true}).fill('');await page.getByLabel('确认密码',{exact:true}).fill('');await page.getByRole('tab',{name:'登录',exact:true}).click();return {short,confirmationRejectedBeforeAuth:true,screenshot};
    });
    await run('N02','partial: actual native window bounds/maximize/restore while logged out; not OS mouse edge drag or authenticated dialogs',async()=>{
      const cdp=await page.context().newCDPSession(page);try{
        const {windowId,bounds}=await cdp.send('Browser.getWindowForTarget');
        await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:960,height:700}});
        await page.getByRole('button',{name:'登录进入 →',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.getByRole('button',{name:'登录进入 →',exact:true}).isVisible(),true);
        const minimum=await cdp.send('Browser.getWindowBounds',{windowId});const screenshot=await capture('signed-out-N02-minimum');
        await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'maximized'}});const maximized=await pollState(()=>cdp.send('Browser.getWindowBounds',{windowId}),value=>value.bounds.windowState==='maximized',{timeoutMs:5000,intervalMs:100,label:'Signed-out native maximize'});
        await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}});
        return {initial:bounds,minimum:minimum.bounds,maximized:maximized.bounds,screenshot,mouseEdgeDragVerified:false,authenticatedDialogsVerified:false};
      }finally{await cdp.detach();}
    });
    const session=await page.evaluate(()=>window.lingjing.invoke('accounts','session',{}));assert.equal(session.ok,true);assert.equal(session.data.currentUser,null);
    proof.noSessionCreated=true;proof.passed=true;return proof;
  } finally {
    proof.completedAt=new Date().toISOString();save();
  }
}
