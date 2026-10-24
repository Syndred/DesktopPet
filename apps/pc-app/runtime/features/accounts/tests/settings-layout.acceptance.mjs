import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const captureBefore = process.argv.includes("--capture-before");
const previous = resolve(process.env.ACCOUNTS_PREVIOUS_EVIDENCE || "artifacts/accounts/electron-1792845865236");
const output = resolve(`artifacts/accounts/settings-layout-${Date.now()}`);
const profile = join(output, "profile");
mkdirSync(output, { recursive: true });
// Copy only the existing synthetic QA profile. The original profile and machine
// preferences stay untouched; this test never submits the settings form.
const caches = new Set(["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage"]);
cpSync(join(previous, "profile"), profile, { recursive: true, filter: path => !caches.has(basename(path)) });
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve(".")], env });
const evidence = { at: new Date().toISOString(), captureBefore, isolatedProfile: profile, checks: [], views: [] };
const record = (name, data) => { evidence.checks.push({ name, data }); console.log("PASS", name); };

try {
  const page = await application.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.title = "灵境 · 设置布局验收（独立数据）"; location.hash = "#/settings"; });
  await page.getByRole("switch", { name: "界面动效", exact: true }).waitFor();
  const before = await page.evaluate(() => window.lingjing.invoke("accounts", "settingsGet"));
  assert.equal(before.ok, true);

  const size = async (width, height) => {
    let request = { width, height };
    // At Windows DPR=1.25 the first native resize can round its frame inset.
    // Correct the measured delta instead of silently accepting another viewport.
    for (let attempt = 0; attempt < 3; attempt++) {
      await application.evaluate(({ BrowserWindow }, dimensions) => {
        BrowserWindow.getAllWindows().find(win => win.getTitle().includes("布局验收")).setSize(dimensions.width, dimensions.height);
      }, request);
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      if (actual.width === width && actual.height === height) break;
      request = { width: request.width + width - actual.width, height: request.height + height - actual.height };
    }
    assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), { width, height });
    await page.evaluate(() => { document.querySelector(".main-content").scrollTop = 0; });
    await page.waitForFunction(() => !document.querySelector(".app-page-motion")?.getAnimations({ subtree: true }).some(animation => animation.playState === "running"));
  };
  const measure = async name => {
    const data = await page.evaluate(() => {
      const rect = node => {
        const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const main = document.querySelector(".main-content");
      const save = [...document.querySelectorAll("button")].find(node => node.textContent === "保存设置");
      const privacy = [...document.querySelectorAll(".ac-card")].find(node => node.querySelector("h2")?.textContent === "位置与隐私");
      return {
        viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
        main: { ...rect(main), scrollTop: main.scrollTop, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        save: rect(save), privacy: rect(privacy),
        page: rect(document.querySelector(".ac-preferences-page")),
        preview: document.querySelector(".ac-desktop-scene") ? rect(document.querySelector(".ac-desktop-scene")) : null,
        typography: Object.fromEntries(["body", ".accounts", ".ac-page-heading h1", ".ac-setting-row strong", ".ac-setting-row small"].map(selector => {
          const css = getComputedStyle(document.querySelector(selector));
          return [selector, { fontFamily: css.fontFamily, fontSize: css.fontSize, lineHeight: css.lineHeight }];
        })),
        switches: [...document.querySelectorAll('[role="switch"]')].map(track => {
          const thumb = track.querySelector('[data-slot="switch-thumb"]');
          const css = getComputedStyle(thumb);
          return { label: track.getAttribute("aria-label"), checked: track.getAttribute("aria-checked"), track: rect(track), thumb: rect(thumb), translate: css.translate, transform: css.transform };
        })
      };
    });
    evidence.views.push({ name, ...data });
    return data;
  };
  const containedThumbs = view => {
    for (const control of view.switches) {
      const { track, thumb } = control;
      assert.ok(thumb.left >= track.left + 1 && thumb.right <= track.right - 1 && thumb.top >= track.top + 1 && thumb.bottom <= track.bottom - 1, `${control.label}: full thumb must remain inside track`);
      assert.ok(Math.abs(thumb.width - thumb.height) < 0.2, `${control.label}: thumb must be circular`);
      assert.ok(Math.abs((thumb.top - track.top) - (track.bottom - thumb.bottom)) < 0.2, `${control.label}: thumb must be vertically centered`);
      const inset = control.checked === "true" ? track.right - thumb.right : thumb.left - track.left;
      assert.ok(inset >= 2 && inset <= 4, `${control.label}: thumb must align with the selected end of its track`);
    }
  };

  await size(1280, 844);
  const desktop = await measure("desktop-1280x844");
  await page.screenshot({ path: join(output, "desktop-1280x844.png") });
  if (!captureBefore) {
    containedThumbs(desktop);
    assert.ok(desktop.save.bottom <= desktop.main.bottom && desktop.save.top >= desktop.main.top, "1280: save action must be visible without scrolling");
    assert.ok(desktop.privacy.bottom <= desktop.main.bottom, "1280: full privacy section must be visible without scrolling");
    assert.ok(desktop.main.scrollHeight <= desktop.main.clientHeight + 1, "1280: settings page must fit at normal scale");
    assert.ok(desktop.main.scrollWidth <= desktop.main.clientWidth, "1280: no horizontal overflow");
    record("1280×844: all tracks contain complete circular thumbs, privacy and save are visible without scrolling", desktop);

    // Exercise each opposite visual state in the controlled renderer, with no
    // submit/IPC save. This catches checked-only displacement regressions.
    for (const control of desktop.switches) await page.getByRole("switch", { name: control.label, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".accounts")?.getAnimations({ subtree: true }).some(animation => animation.playState === "running"));
    const opposite = await measure("opposite-switch-states");
    containedThumbs(opposite);
    for (let i = 0; i < desktop.switches.length; i++) assert.notEqual(opposite.switches[i].checked, desktop.switches[i].checked);
    record("both states of every switch keep the full thumb inside its actual track");
    for (const control of desktop.switches) await page.getByRole("switch", { name: control.label, exact: true }).click();

    await size(1440, 900);
    const wide = await measure("wide-1440x900");
    containedThumbs(wide);
    assert.ok(wide.main.scrollHeight <= wide.main.clientHeight + 1);
    assert.ok(wide.save.bottom <= wide.main.bottom && wide.privacy.bottom <= wide.main.bottom);
    await page.screenshot({ path: join(output, "wide-1440x900.png") });
    record("1440×900: settings, privacy and save remain fully visible at normal scale");

    await size(1024, 700);
    const compact = await measure("compact-1024x700");
    containedThumbs(compact);
    assert.equal(compact.preview.width, 0, "small window: optional preview must yield space to settings");
    assert.ok(compact.main.scrollHeight > compact.main.clientHeight, "small window: content must scroll naturally");
    assert.ok(compact.main.scrollWidth <= compact.main.clientWidth, "small window: no horizontal overflow");
    await page.screenshot({ path: join(output, "compact-1024x700-top.png") });
    await page.getByRole("button", { name: "保存设置", exact: true }).scrollIntoViewIfNeeded();
    const compactBottom = await measure("compact-save-scrolled-into-view");
    assert.ok(compactBottom.main.scrollTop > 0, "small window: main scroll container must expose the save action");
    assert.ok(compactBottom.save.bottom <= compactBottom.main.bottom && compactBottom.save.top >= compactBottom.main.top);
    await page.screenshot({ path: join(output, "compact-1024x700-save.png") });
    record("1024×700: natural vertical scrolling exposes save with no horizontal overflow");

    await page.evaluate(() => { location.hash = "#/settings/privacy"; });
    await page.getByRole("heading", { name: "通知与安静时段", exact: true }).waitFor();
    await size(1280, 844);
    const privacy = await measure("notification-and-privacy-1280x844");
    containedThumbs(privacy);
    await page.screenshot({ path: join(output, "notification-and-privacy-1280x844.png") });
    record("notification and privacy page consumes the same centered Radix switch styling");

    const after = await page.evaluate(() => window.lingjing.invoke("accounts", "settingsGet"));
    assert.equal(after.data.revision, before.data.revision);
    assert.deepEqual(after.data.document, before.data.document);
    record("render-only verification leaves stored settings and privacy preferences unchanged");
    evidence.passed = true;
  }
  writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("ACCOUNTS_SETTINGS_LAYOUT", output);
} catch (error) {
  evidence.error = { message: error.message, stack: error.stack };
  writeFileSync(join(output, "failure.json"), JSON.stringify(evidence, null, 2));
  console.error(error); process.exitCode = 1;
} finally { await application.close(); }
