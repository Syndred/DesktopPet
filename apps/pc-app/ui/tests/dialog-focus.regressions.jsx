import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppDialog } from '../src/components/dialog';
window.IS_REACT_ACT_ENVIRONMENT = true;
const delay = () => new Promise(resolve => setTimeout(resolve, 30));
const check = (value, name) => { if (!value) throw Error(name); };
window.runDialogTests = async () => {
  const results = [];
  const source = window.dialogGeometrySource;
  const generic = source?.globalCSS.match(/\.app-dialog-content\{([^}]+)\}/)?.[1];
  check(Boolean(generic), 'generic dialog CSS exists');
  // Tailwind uses the independent translate property; it must not combine with
  // the app's legacy centering transform (which displaced long dialogs offscreen).
  check(source.sharedDialog.includes('-translate-x-1/2 -translate-y-1/2'), 'shared dialog independent centering contract');
  check(/(?:^|;)translate:none!important(?:;|$)/.test(generic), 'generic dialog cancels independent Tailwind translate');
  check(/(?:^|;)transform:translate\(-50%,-50%\)(?:;|$)/.test(generic), 'generic dialog preserves single legacy centering transform');
  check(/translate:none!important/.test(source.minifiedCSS), 'production CSS optimizer preserves centering override');
  if (source.compiledCSS !== undefined) check(/translate:none!important/.test(source.compiledCSS), 'actual built generic dialog preserves centering override');
  results.push('single-centering-css-contract');
  results.push('production-css-optimizer-contract');
  if (source.compiledCSS !== undefined) results.push('actual-compiled-css-contract');
  for (const mode of ['escape', 'cancel', 'busy', 'removed', 'unmount', 'moved', 'disabled', 'hidden', 'inert']) {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host); let update;
    function Fixture() {
      const [state, set] = useState({ open: false, trigger: true }); update = set;
      return <>{state.trigger && <button id="opener" onClick={() => set(s => ({ ...s, open: true }))}>Open</button>}
        <button id="elsewhere">Other page</button>
        {state.open && <AppDialog title="Test dialog" busy={mode === 'busy'} onClose={() => set(s => ({ ...s, open: false }))}>
          <button id="cancel" onClick={() => set(s => ({ ...s, open: false }))}>Cancel</button>
        </AppDialog>}</>;
    }
    await act(async () => { root.render(<Fixture />); });
    const opener = host.querySelector('#opener'); opener.focus();
    await act(async () => { opener.click(); await delay(); });
    check(document.querySelector('[role=dialog]'), `${mode}: opens`);
    if (mode === 'removed' || mode === 'moved') {
      act(() => { update({ open: false, trigger: mode === 'moved' }); });
      host.querySelector('#elsewhere').focus();
      await act(async () => { await delay(); });
      check(document.activeElement === host.querySelector('#elsewhere'), `${mode}: does not steal focus`);
    } else if (mode === 'unmount') {
      const next = document.createElement('button'); document.body.append(next);
      await act(async () => { root.unmount(); next.focus(); await delay(); });
      check(document.activeElement === next, 'unmount: does not steal focus'); next.remove();
    } else if (['disabled', 'hidden', 'inert'].includes(mode)) {
      if (mode === 'disabled') opener.disabled = true;
      else opener.setAttribute(mode, '');
      await act(async () => { document.querySelector('#cancel').click(); await delay(); });
      check(document.activeElement !== opener, `${mode}: unsafe trigger not focused`);
    } else if (mode === 'cancel') {
      await act(async () => { document.querySelector('#cancel').click(); await delay(); });
      check(document.activeElement === opener, 'cancel: returns to opener');
    } else {
      await act(async () => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await delay(); });
      if (mode === 'busy') {
        check(document.querySelector('[role=dialog]'), 'busy: Escape stays open');
        await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); await delay(); });
        check(document.querySelector('[role=dialog]'), 'busy: outside press stays open');
      }
      else check(document.activeElement === opener, 'escape: returns to opener');
    }
    if (mode !== 'unmount') await act(async () => { root.unmount(); await delay(); });
    host.remove(); results.push(mode);
  }
  return { passed: true, checks: results, nativePassed: false, geometryPassed: false };
};
