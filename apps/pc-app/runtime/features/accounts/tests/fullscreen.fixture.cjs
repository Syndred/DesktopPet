const { app, BrowserWindow } = require("electron");
const { resolve } = require("node:path");
app.setPath("userData", resolve(process.env.ACCOUNTS_FULLSCREEN_PROFILE));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ fullscreen: true, show: true, title: "灵境 · Win32全屏检测验收", webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadURL("data:text/html;charset=utf-8,<title>灵境 · Win32全屏检测验收</title><body style='background:%23edf3ff;font:24px sans-serif;padding:60px'><h1>Win32 全屏检测验收</h1><p>独立测试窗口，验证完成后自动关闭。</p></body>");
  win.focus();
});
