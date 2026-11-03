// Aura OS desktop shell (Electron). Loads the same index.html as the web version.
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { scan } = require('./wifi');

let win = null, btCallback = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#000', title: 'Aura OS', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, webviewTag: true },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Links that try to open a new window go to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });

  // Web Bluetooth: Chromium asks us to choose a device. Forward the live list to the page's own picker.
  win.webContents.on('select-bluetooth-device', (e, list, cb) => {
    e.preventDefault(); btCallback = cb;
    win.webContents.send('aura:bt-list', list.map(d => ({ id: d.deviceId, name: d.deviceName })));
  });
  win.on('closed', () => { win = null; });
}

ipcMain.on('aura:version', e => { e.returnValue = app.getVersion(); });
ipcMain.on('aura:bt-select', (_e, id) => { if (btCallback) { btCallback(String(id)); btCallback = null; } });
ipcMain.on('aura:bt-cancel', () => { if (btCallback) { btCallback(''); btCallback = null; } });
ipcMain.handle('aura:wifi-scan', () => scan());
ipcMain.handle('aura:open-external', (_e, url) => { if (/^https?:\/\//i.test(String(url))) return shell.openExternal(String(url)); });
ipcMain.handle('aura:open-network-settings', async () => {
  if (process.platform === 'win32') return shell.openExternal('ms-settings:network-wifi');
  if (process.platform === 'darwin') return shell.openExternal('x-apple.systempreferences:com.apple.wifi-settings-extension').catch(() => shell.openExternal('x-apple.systempreferences:com.apple.preference.network'));
  for (const [cmd, args] of [['gnome-control-center', ['wifi']], ['nm-connection-editor', []], ['kcmshell6', ['kcm_networkmanagement']]]) {
    const ok = await new Promise(r => { const c = spawn(cmd, args, { stdio: 'ignore', detached: true }); c.on('error', () => r(false)); c.on('spawn', () => { c.unref(); r(true); }); });
    if (ok) return;
  }
  throw new Error('No network settings program found');
});

app.whenReady().then(() => {
  // The page itself is trusted; allow the hardware features Aura OS apps use.
  const allow = new Set(['media', 'geolocation', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allow.has(perm)));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
