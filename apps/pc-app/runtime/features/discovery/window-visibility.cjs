// BrowserWindow.hide() can leave document.visibilityState="visible" on Windows.
// Keep the final privacy boundary in the main process, independently of React.
function observeExplorationWindows(electron, onVisibility) {
  const {app,BrowserWindow}=electron;
  if(!app?.on || !BrowserWindow?.getAllWindows) return {isVisible:()=>true,dispose(){}};
  const attached=new Map();
  function locationWindow(window) {
    try {
      if(window.isDestroyed())return false;
      const url=new URL(window.webContents.getURL());
      if(/^#\/desktop(?:\/|$)/.test(url.hash))return false;
      return (url.protocol==='file:'&&/\/dist\/ui\/index\.html$/.test(url.pathname)) ||
        Boolean(process.env.ELECTRON_RENDERER_URL&&url.origin===new URL(process.env.ELECTRON_RENDERER_URL).origin);
    }catch{return false;}
  }
  const visible=except=>BrowserWindow.getAllWindows().some(window=>window!==except&&locationWindow(window)&&window.isVisible()&&!window.isMinimized());
  function attach(_event,window) {
    if(attached.has(window))return;
    const hidden=()=>{if(locationWindow(window)&&!visible(window))onVisibility(false);};
    const shown=()=>{
      if(locationWindow(window)&&/^#\/discovery(?:\/|$|\?)/.test(new URL(window.webContents.getURL()).hash))onVisibility(true);
    };
    const cleanup=()=>{
      for(const name of ['hide','minimize','close'])window.removeListener(name,hidden);
      for(const name of ['show','restore'])window.removeListener(name,shown);
      window.removeListener('closed',cleanup);attached.delete(window);
    };
    for(const name of ['hide','minimize','close'])window.on(name,hidden);
    for(const name of ['show','restore'])window.on(name,shown);
    window.on('closed',cleanup);attached.set(window,cleanup);
  }
  for(const window of BrowserWindow.getAllWindows())attach(null,window);
  app.on('browser-window-created',attach);
  return {isVisible:()=>visible(),dispose(){app.removeListener('browser-window-created',attach);for(const cleanup of [...attached.values()])cleanup();}};
}
module.exports={observeExplorationWindows};
