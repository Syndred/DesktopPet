// Narrow native acceptance: ordinary fresh-profile portable launch, no QA grant,
// registration, cloud mutation, gameplay or reusable user profile.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
import { verifyPortableDefaultConfig } from './portable-config-smoke.mjs';
import { inspectSignedOut } from './portable-signed-out-inspect.mjs';
import { sha256 } from '../release/release-store.mjs';
const config = JSON.parse(readFileSync('scripts/release/electron-builder.pc.json'));
const version = JSON.parse(readFileSync('package.json')).version;
const build = JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable = resolve(config.directories.output, `Lingjing-${version}-portable-x64.exe`);
const output = resolve('artifacts/foundation/cloud-engineering/focused-portable', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const proof = { scope: 'Actual Windows portable SFX, fresh logged-out profile. Startup/configuration only, not live-account repair acceptance.', sourceCommit: build.sourceCommit, startedAt: new Date().toISOString(), executable, executableSha256: await sha256(executable) };
try {
  proof.ordinary = await verifyPortableDefaultConfig({ executable, expectedSource: build.sourceCommit, output, inspect: async ({page, info, profile}) => {
    const signedOut = await inspectSignedOut({page, output});
    const versionLabel = page.getByLabel('应用版本');
    await versionLabel.waitFor();
    await page.waitForFunction(expected => document.querySelector('[aria-label="应用版本"]')?.textContent.includes(expected), build.sourceCommit.slice(0,12));
    assert.ok((await versionLabel.textContent()).includes(version));
    assert.ok((await versionLabel.textContent()).includes(build.sourceCommit.slice(0,12)));
    await versionLabel.getByRole('link', {name:'关于与诊断'}).click();
    await page.getByRole('heading', {name:'关于与本地诊断',exact:true}).waitFor();
    assert.equal(info.version, version);
    assert.equal(info.build.sourceCommit, build.sourceCommit);
    assert.equal(info.build.compiledFingerprint, build.compiledFingerprint);
    assert.deepEqual(info.build.sourceDirtyFiles, []);
    assert.equal(resolve(info.support.executablePath), executable, 'About must reveal stable outer SFX, not extracted temporary exe');
    assert.equal(info.support.automaticUpdates, false);
    const text = await page.getByRole('heading', {name:'关于与本地诊断',exact:true}).locator('..').textContent();
    for(const value of [build.sourceCommit,build.compiledFingerprint,info.support.executablePath]) assert.ok(text.includes(value));
    assert.ok(text.includes('没有配置官方下载地址或自动更新服务'));
    await page.getByRole('button', {name:'显示程序文件',exact:true}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === '显示程序文件')?.disabled);
    assert.equal(await page.getByRole('alert').count(),0,'Opening stable launcher must not report an IPC error');
    let logs = 'unavailable-clearly-disabled';
    const logsButton = page.getByRole('button', {name:'打开本地日志目录',exact:true});
    if(info.support.logsAvailable) {
      const rel = relative(profile, info.support.logsPath);
      assert.ok(rel && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel), 'Only fresh owned-profile logs may be opened');
      await logsButton.click();
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === '打开本地日志目录')?.disabled);
      assert.equal(await page.getByRole('alert').count(),0);
      logs='owned-profile-directory-opened';
    } else assert.equal(await logsButton.isDisabled(),true);
    await page.screenshot({path:join(output,'about.png')});
    return {signedOut,loginVersion:true,aboutVersionBuild:true,outerLauncherPathVerified:true,revealIpcReturnedWithoutError:true,explorerVisualVerified:false,logs,notLiveAccountAcceptance:true};
  } });
  proof.passed = true;
} catch (error) { proof.passed = false; proof.error = String(error); process.exitCode = 1; }
finally { proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2)); }
