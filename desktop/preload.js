// Exposes a small, explicit bridge to the Aura OS page as window.auraNative.
const { contextBridge, ipcRenderer } = require('electron');

// Electron prefixes IPC errors with "Error invoking remote method ..."; show users only the real message.
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a).catch(e => { throw new Error(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); });

contextBridge.exposeInMainWorld('auraNative', {
  platform: process.platform,
  version: ipcRenderer.sendSync('aura:version'),
  wifi: { scan: () => call('aura:wifi-scan'), current: () => call('aura:wifi-current') },
  system: { info: () => call('aura:sys-info'), stats: () => call('aura:sys-stats'), battery: () => call('aura:battery') },
  bluetooth: {
    // Called with the live list of nearby devices while the picker is open. Returns an unsubscribe fn.
    onList(cb) { const h = (_e, list) => cb(list); ipcRenderer.on('aura:bt-list', h); return () => ipcRenderer.removeListener('aura:bt-list', h); },
    select: id => ipcRenderer.send('aura:bt-select', id),
    cancel: () => ipcRenderer.send('aura:bt-cancel'),
  },
  openNetworkSettings: () => call('aura:open-network-settings'),
  openExternal: url => call('aura:open-external', url),
});
