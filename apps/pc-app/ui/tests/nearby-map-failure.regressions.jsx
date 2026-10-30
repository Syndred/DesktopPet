import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { NearbyMap } from '../src/features/discovery/NearbyMap';
window.IS_REACT_ACT_ENVIRONMENT = true;
const check = (ok, label) => { if (!ok) throw Error(label); };
const state = { map: { id: 'nasa-gibs-bluemarble', available: true, maxZoom: 19 }, mapLocation: { lat: 30, lng: 120 }, location: { mode: 'demo', fix: { accuracyMeters: 5 } }, territories: [], spawns: [] };
window.runMapTests = async () => {
  const results = [];
  for (const mode of ['constructor', 'control', 'listener', 'observer']) {
    window.mapMode = mode; window.maps = []; window.removed = 0; window.disconnected = 0;
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<><p>列表仍可使用</p><NearbyMap state={state}/></>));
    check(host.textContent.includes('地图暂时不可用'), `${mode}: local error visible`);
    check(host.textContent.includes('列表仍可使用'), `${mode}: sibling retained`);
    check(host.querySelector('.discovery-map').dataset.mapReady === 'false', `${mode}: not falsely ready`);
    check(!host.querySelector('canvas'), `${mode}: partial canvas removed`);
    check(window.removed === (mode === 'constructor' ? 0 : 1), `${mode}: removes owned instance once`);
    window.mapMode = 'success';
    await act(async () => host.querySelector('[aria-label="重新加载底图"]').click());
    const instance = window.maps.at(-1);
    await act(async () => instance.events['style.load']());
    check(host.querySelector('.discovery-map').dataset.mapReady === 'true', `${mode}: explicit retry succeeds`);
    check(!host.textContent.includes('地图暂时不可用'), `${mode}: retry clears error`);
    const before = window.removed;
    await act(async () => root.unmount());
    check(window.removed === before + 1, `${mode}: unmount removes recovered instance once`);
    check(window.disconnected >= 1, `${mode}: observer disconnected`);
    // Detached instance callbacks must not touch the later component.
    await act(async () => instance.events.error({ error: new Error('late') }));
    host.remove(); results.push(mode);
  }
  window.mapMode = 'constructor';
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<NearbyMap state={state} mini/>));
  check(host.querySelector('[role=status]')?.textContent.includes('地图暂时不可用'), 'mini: error visible');
  check(!host.querySelector('[aria-label="重新加载底图"]'), 'mini: no automatic retry/new control');
  await act(async () => root.unmount()); host.remove(); results.push('mini');
  return { passed: true, cases: results };
};
