// Launches the real Electron app (use under xvfb on Linux) and checks the native bridge.
// xvfb-run -a node scripts/smoke.js
const { _electron: electron } = require('playwright');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  require('./sync-app.js');
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox'] });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.waitForSelector('#lock', { state: 'visible', timeout: 15000 }); await page.waitForTimeout(700);
  await page.click('#lock'); await page.waitForTimeout(800);

  console.log('Native bridge');
  ok(await page.evaluate(() => typeof window.auraNative === 'object' && typeof auraNative.wifi.scan === 'function'), 'window.auraNative exposed');
  ok(await page.evaluate(() => auraNative.platform) === process.platform, 'platform reported');
  ok(await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'page has no Node access (isolated)');
  ok(await page.evaluate(() => !('serviceWorker' in navigator) || navigator.serviceWorker.controller === null), 'no service worker in the desktop app');

  console.log('Wi-Fi');
  const w = await page.evaluate(() => auraNative.wifi.scan().then(l => ({ l }), e => ({ e: e.message })));
  ok(Array.isArray(w.l) || /^nmcli \(NetworkManager\) is not installed$/.test(w.e || '') || (w.e && !/Error invoking/.test(w.e)), 'scan returns a list or an honest error (' + (w.e ? w.e.slice(0, 60) : w.l.length + ' networks') + ')');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'wifi' })); await page.waitForTimeout(500);
  ok((await page.textContent('.window:last-child')).includes('Nearby networks'), 'Wi-Fi page shows the Nearby networks section');

  console.log('Bluetooth IPC');
  await page.evaluate(() => { window.__lists = []; window.__off = auraNative.bluetooth.onList(l => __lists.push(l)); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('aura:bt-list', [{ id: 'AA:BB', name: 'Headset' }]));
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => __lists.length === 1 && __lists[0][0].name === 'Headset'), 'device list reaches the page');
  await page.evaluate(() => { __off(); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('aura:bt-list', []));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => __lists.length === 1), 'unsubscribe stops updates');
  await page.evaluate(() => { auraNative.bluetooth.select('AA:BB'); auraNative.bluetooth.cancel(); });
  ok(true, 'select/cancel IPC does not throw with no pending request');

  console.log('Real device data');
  const os = require('os');
  const info = await page.evaluate(() => auraNative.system.info());
  ok(info.cpu.cores === os.cpus().length && info.cpu.model === os.cpus()[0].model.replace(/\s+/g, ' ').trim(), 'CPU model and core count match this machine (' + info.cpu.cores + ' cores)');
  ok(Math.abs(info.mem.total - os.totalmem()) < 1e6 && info.os.hostname === os.hostname(), 'memory total and hostname are real');
  ok(info.disks.length >= 1 && info.disks[0].total > info.disks[0].free && info.disks[0].free > 0, 'disk size and free space are real');
  ok(Array.isArray(info.displays) && info.displays[0].w > 0, 'display info present');
  const st1 = await page.evaluate(() => auraNative.system.stats()); await page.waitForTimeout(600);
  const st2 = await page.evaluate(() => auraNative.system.stats());
  ok(typeof st2.cpu === 'number' && st2.cpu >= 0 && st2.cpu <= 100, 'live CPU load is a real percentage (' + st2.cpu + '%)');
  ok(st2.procs.length >= 2 && st2.procs.some(p => p.type === 'Browser') && st2.memTotal > st2.memUsed, 'process list comes from Electron metrics');
  ok(await page.evaluate(() => 'battery' in auraNative.system) && (await page.evaluate(() => auraNative.system.battery().then(b => b === null || (typeof b.percent === 'number' && b.percent >= 0 && b.percent <= 100)))), 'battery is null (desktop PC) or a valid percentage');
  const wc = await page.evaluate(() => auraNative.wifi.current()); ok(wc === null || typeof wc.ssid === 'string' || wc.redacted, 'current Wi-Fi is null or a real connection');
  await page.evaluate(() => AuraOS.launch('sysinfo')); await page.waitForTimeout(700);
  let txt = await page.textContent('.window:last-child');
  ok(txt.includes(info.cpu.model) && txt.includes('Electron ' + info.versions.electron) && !txt.includes('Browser (limited)'), 'System Info shows the real processor and runtime');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await page.evaluate(() => AuraOS.launch('monitor')); await page.waitForTimeout(1800);
  txt = await page.textContent('.window:last-child');
  ok(txt.includes('Live data from your computer') && txt.includes('CPU load') && /Aura OS\)/.test(txt), 'Activity Monitor shows live CPU, memory and processes');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Safari uses <webview>');
  await page.evaluate(() => AuraOS.launch('safari', { url: 'about:blank' })); await page.waitForTimeout(500);
  ok(await page.$('.window:last-child webview') !== null, 'Safari renders a webview, not an iframe');
  ok(await page.$('.window:last-child iframe.browser-view') === null, 'no sandboxed iframe');

  console.log('Open external is restricted');
  ok(await page.evaluate(() => auraNative.openExternal('file:///etc/passwd')) == null, 'non-http URLs are ignored');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await app.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
