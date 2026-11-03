// End-to-end test for Aura OS. Run: node tests/e2e.js [url] [outDir]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = process.argv[3] || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
  // Mock every network service so the suite is deterministic and works offline.
  const json = (o, st = 200) => ({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  const SB = { files: {}, settings: null, users: { 'test@example.com': 'secret1' }, calls: [] };
  await ctx.route(/cloudflare\.com\/cdn-cgi\/trace/, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'ip=203.0.113.9\nloc=XX\ncolo=TST\nhttp=http/2\ntls=TLSv1.3\n' }));
  await ctx.route(/ipwho\.is/, r => r.fulfill(json({ success: true, city: 'Testville', region: 'TS', country: 'Nowhere', latitude: 10, longitude: 20, connection: { isp: 'TestNet' }, timezone: { id: 'UTC' } })));
  await ctx.route(/open-meteo\.com\/v1\/forecast/, r => {
    const t = [], tc = [], hr = new Date(); hr.setMinutes(0, 0, 0);
    for (let i = -2; i < 48; i++) { t.push(new Date(hr.getTime() + i * 3600e3 - hr.getTimezoneOffset() * 60e3).toISOString().slice(0, 16)); tc.push(10 + i % 5); }
    const days = [...Array(7)].map((_, i) => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10));
    r.fulfill(json({ current: { time: t[2], temperature_2m: 21.4, apparent_temperature: 20, relative_humidity_2m: 55, wind_speed_10m: 9, weather_code: 0, is_day: 1 }, hourly: { time: t, temperature_2m: tc, weather_code: tc.map(() => 1) }, daily: { time: days, weather_code: days.map(() => 2), temperature_2m_max: days.map(() => 25), temperature_2m_min: days.map(() => 12) } }));
  });
  await ctx.route(/geocoding-api\.open-meteo\.com/, r => r.fulfill(json({ results: [{ name: 'Paris', admin1: 'Ile-de-France', country_code: 'FR', latitude: 48.85, longitude: 2.35 }] })));
  await ctx.route(/\.supabase\.co\//, async r => {
    const q = new globalThis.URL(r.request().url()), m = r.request().method(), pth = q.pathname; SB.calls.push(m + ' ' + pth);
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pth === '/auth/v1/token') {
      const b = JSON.parse(r.request().postData() || '{}');
      if (SB.users[b.email] !== b.password) return r.fulfill(json({ error_description: 'Invalid login credentials' }, 400));
      return r.fulfill(json({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u-1', email: b.email } }));
    }
    if (pth === '/rest/v1/aura_files') {
      if (m === 'GET') { const p = q.searchParams.get('path'); const all = Object.values(SB.files); return r.fulfill(json(p ? all.filter(f => 'eq.' + f.path === p) : all)); }
      if (m === 'POST') { JSON.parse(r.request().postData()).forEach(f => SB.files[f.path] = f); return r.fulfill(json([])); }
      if (m === 'DELETE') { SB.files = {}; return r.fulfill(json([])); }
    }
    if (pth === '/rest/v1/aura_settings') {
      if (m === 'GET') return r.fulfill(json(SB.settings ? [SB.settings] : []));
      if (m === 'POST') { SB.settings = { data: JSON.parse(r.request().postData())[0].data, updated_at: new Date().toISOString() }; return r.fulfill(json([SB.settings])); }
      if (m === 'DELETE') { SB.settings = null; return r.fulfill(json([])); }
    }
    r.fulfill(json({ message: 'not mocked' }, 404));
  });
  // Fake Web Bluetooth (headless Chromium has none).
  await ctx.addInitScript(() => {
    const dev = { id: 'bt-dev-1', name: 'Test Buds', addEventListener() {}, forget() {}, gatt: { connected: false } };
    const chr = { readValue: async () => new DataView(new Uint8Array([77]).buffer), startNotifications: async () => {}, addEventListener() {} };
    dev.gatt.connect = async () => { dev.gatt.connected = true; return { getPrimaryService: async n => { if (n === 'battery_service') return { getCharacteristic: async () => chr }; throw new Error('no service'); } }; };
    dev.gatt.disconnect = () => { dev.gatt.connected = false; };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { getAvailability: async () => true, getDevices: async () => [], requestDevice: async () => dev } });
    window.__btDev = dev;
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/\/auth\/v1\/token/.test(m.location().url) && errors.push(m.text())); // wrong-password test makes an expected 400
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
  const wins = () => page.evaluate(() => AuraOS.WM.wins.length);
  const openApp = async id => { if (await page.$(`.di[data-app="${id}"]`)) await page.click(`.di[data-app="${id}"]`); else await page.evaluate(i => AuraOS.launch(i), id); await page.waitForTimeout(350); };

  console.log('Boot & lock');
  await page.goto(URL);
  await page.waitForTimeout(600); await shot('01-boot');
  await page.waitForSelector('#lock', { state: 'visible', timeout: 6000 });
  await page.waitForTimeout(700); await shot('02-lock');
  await page.click('#lock'); await page.waitForTimeout(800);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'none', 'unlock hides lock screen');
  ok(await page.$$eval('.di', e => e.length) >= 11, 'dock rendered');
  ok((await page.textContent('#mbclock')).length > 5, 'menu bar clock shows');
  ok(await page.$$eval('#icons .ficon', e => e.length) >= 2, 'desktop icons (Welcome.txt) shown');

  console.log('Finder + file system');
  await openApp('finder');
  ok(await wins() === 1, 'Finder opens');
  await page.click('.window .sb:has-text("Documents")');
  ok((await page.textContent('.window .fgrid')).includes('Todo.txt'), 'Documents lists Todo.txt');
  await page.click('.window .fgrid', { button: 'right', position: { x: 400, y: 250 } });
  await page.click('.dd .it:has-text("New Folder")');
  await page.fill('#dlg input', 'Projects'); await page.click('#dlg .btn.pri');
  await page.waitForTimeout(200);
  ok((await page.textContent('.window .fgrid')).includes('Projects'), 'create folder via context menu');
  await page.dblclick('.window .ficon:has-text("Projects")');
  ok((await page.textContent('.window .main .toolbar')).includes('Projects'), 'navigate into folder');
  await shot('03-finder');
  await page.click('.window .tbtn[title="Back"]');
  // rename
  await page.click('.window .ficon:has-text("Projects")', { button: 'right' });
  await page.click('.dd .it:has-text("Rename")');
  await page.fill('#dlg input', 'Work'); await page.click('#dlg .btn.pri'); await page.waitForTimeout(200);
  ok((await page.textContent('.window .fgrid')).includes('Work'), 'rename folder');
  // trash
  await page.click('.window .ficon:has-text("Work")', { button: 'right' });
  await page.click('.dd .it:has-text("Move to Trash")'); await page.waitForTimeout(200);
  ok(!(await page.textContent('.window .fgrid')).includes('Work'), 'move to trash removes item');
  ok(await page.evaluate(() => !!AuraOS.FS.get('/Trash/Work')), 'item is in /Trash');
  await page.click('.window .sb:has-text("Trash")');
  ok((await page.textContent('.window .fgrid')).includes('Work'), 'Trash shows item');
  // open text file -> TextEdit
  await page.click('.window .sb:has-text("Documents")');
  await page.dblclick('.window .ficon:has-text("Todo.txt")'); await page.waitForTimeout(400);
  ok(await page.$eval('.window:last-child textarea', t => t.value.includes('Try every app')), 'double-click opens file in TextEdit');
  await page.fill('.window:last-child textarea', 'edited content');
  await page.keyboard.press('Control+s'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => AuraOS.FS.read('/Users/user/Documents/Todo.txt')) === 'edited content', 'Ctrl+S saves file');

  console.log('Window manager');
  const w = await page.$('.window:last-child'); const b0 = await w.boundingBox();
  await page.mouse.move(b0.x + 200, b0.y + 15); await page.mouse.down(); await page.mouse.move(b0.x + 320, b0.y + 95, { steps: 5 }); await page.mouse.up();
  const b1 = await w.boundingBox();
  ok(Math.abs(b1.x - b0.x - 120) < 3 && Math.abs(b1.y - b0.y - 80) < 3, 'drag window by titlebar');
  await page.mouse.move(b1.x + b1.width - 5, b1.y + b1.height - 5); await page.mouse.down(); await page.mouse.move(b1.x + b1.width + 100, b1.y + b1.height + 60, { steps: 5 }); await page.mouse.up();
  const b2 = await w.boundingBox();
  ok(b2.width > b1.width + 90 && b2.height > b1.height + 50, 'resize window from corner');
  await w.$eval('.traffic i:nth-child(3)', e => e.click()); await page.waitForTimeout(450);
  ok((await w.boundingBox()).width >= 1430, 'zoom (maximize) fills screen');
  await w.$eval('.traffic i:nth-child(3)', e => e.click()); await page.waitForTimeout(450);
  await w.$eval('.traffic i:nth-child(2)', e => e.click()); await page.waitForTimeout(400);
  ok(await w.evaluate(e => e.classList.contains('minimized')), 'minimize');
  await page.click('.di[data-app="textedit"]'); await page.waitForTimeout(500);
  ok(await w.evaluate(e => !e.classList.contains('minimized')), 'restore from dock');
  const n = await wins();
  await w.$eval('.traffic i:nth-child(1)', e => e.click()); await page.waitForTimeout(400);
  ok(await wins() === n - 1, 'close window');

  console.log('Terminal');
  await openApp('terminal');
  const term = async c => { await page.fill('.window:last-child .term input', c); await page.keyboard.press('Enter'); await page.waitForTimeout(120); };
  await term('mkdir demo'); await term('cd demo'); await term('echo hello aura > hi.txt'); await term('cat hi.txt');
  await term('pwd'); await term('ls -l'); await term('touch a b'); await term('cp hi.txt c.txt'); await term('mv c.txt d.txt'); await term('ls');
  const tt = await page.textContent('.window:last-child .term');
  ok(tt.includes('hello aura'), 'echo > file, cat');
  ok(tt.includes('/Users/user/demo'), 'cd + pwd');
  ok(/hi\.txt\s+.*d\.txt|d\.txt/.test(tt), 'cp/mv/ls');
  await term('rm hi.txt'); await term('nonsense'); await term('calc 6*7'); await term('tree ~');
  const tt2 = await page.textContent('.window:last-child .term');
  ok(tt2.includes('command not found'), 'unknown command error');
  ok(tt2.includes('42'), 'calc command');
  ok(await page.evaluate(() => !AuraOS.FS.exists('/Users/user/demo/hi.txt') && AuraOS.FS.exists('/Users/user/demo/d.txt')), 'fs state matches terminal');
  await term('neofetch'); await shot('04-terminal');
  await term('theme dark'); ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'terminal theme dark');
  await shot('04b-dark'); await term('theme light');

  console.log('Calculator');
  await openApp('calculator');
  for (const k of ['7', '×', '6', '=']) await page.click(`.window:last-child .calc button[data-k="${k}"]`);
  ok((await page.textContent('.window:last-child .scr')) === '42', '7×6=42');
  await page.click('.window:last-child .calc button[data-k="AC"]');
  await page.keyboard.type('12+30'); await page.keyboard.press('Enter');
  ok((await page.textContent('.window:last-child .scr')) === '42', 'keyboard 12+30=42');
  await page.click('.window:last-child .calc button[data-k="AC"]');
  for (const k of ['1', '÷', '0', '=']) await page.click(`.window:last-child .calc button[data-k="${k}"]`);
  ok((await page.textContent('.window:last-child .scr')) === 'Error', 'divide by zero → Error');

  console.log('Notes');
  await openApp('notes');
  await page.click('.window:last-child .tbtn:has-text("New Note")');
  await page.fill('.window:last-child textarea', 'Shopping list\nmilk'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => Object.values(AuraOS.FS.get('/Users/user/Documents/Notes').c).some(f => f.d.startsWith('Shopping list'))), 'note autosaved to file system');
  await shot('05-notes');

  console.log('Sketch / Preview');
  await openApp('sketch');
  const cv = await page.$('.window:last-child canvas'); const cb = await cv.boundingBox();
  await page.mouse.move(cb.x + 50, cb.y + 50); await page.mouse.down(); await page.mouse.move(cb.x + 200, cb.y + 120, { steps: 8 }); await page.mouse.up();
  await page.click('.window:last-child .tbtn:has-text("Save to Pictures")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Object.keys(AuraOS.FS.get('/Users/user/Pictures').c).some(n => n.endsWith('.png'))), 'sketch saved PNG to Pictures');
  await page.evaluate(() => AuraOS.launch('preview', { path: '/Users/user/Pictures/' + Object.keys(AuraOS.FS.get('/Users/user/Pictures').c)[0] }));
  await page.waitForTimeout(300);
  ok(await page.$('.window:last-child img') !== null, 'Preview opens image');

  console.log('Snake');
  await openApp('snake'); await page.waitForTimeout(600);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { const s = AuraOS.WM.of('snake')[0].snakeState(); return s.s[0][1] > 10 && !s.over; }), 'snake moves with arrow keys');

  console.log('Settings, Spotlight, Launchpad, Control Center');
  await openApp('settings');
  await page.click('.window:last-child .sb:has-text("Wallpaper")'); await page.click('.window:last-child .wall:nth-child(3)');
  ok(await page.evaluate(() => AuraOS.DB.set.wall) === 2, 'change wallpaper');
  await page.click('.window:last-child .sb:has-text("Appearance")'); await page.click('.window:last-child .swatches i:nth-child(2)');
  ok(await page.evaluate(() => AuraOS.DB.set.accent) === '#bf5af2', 'change accent color');
  await page.keyboard.press('Control+Space'); await page.waitForTimeout(250);
  await page.fill('#spq', 'calc'); await page.waitForTimeout(150);
  ok((await page.textContent('#spr')).includes('Calculator'), 'Spotlight finds app');
  await page.fill('#spq', '12*12'); await page.waitForTimeout(150);
  ok((await page.textContent('#spr')).includes('144'), 'Spotlight evaluates math');
  await page.fill('#spq', 'Welcome'); await page.waitForTimeout(150);
  ok((await page.textContent('#spr')).includes('Welcome.txt'), 'Spotlight finds files');
  await page.keyboard.press('Escape');
  await page.keyboard.press('F4'); await page.waitForTimeout(300);
  ok(await page.$$eval('#lpgrid .lpi', e => e.length) >= 9, 'Launchpad lists apps'); await shot('06-launchpad');
  await page.keyboard.press('Escape');
  await page.click('#mbcc'); await page.waitForTimeout(250); await shot('07-controlcenter');
  await page.click('#cc .tile:has-text("Dark Mode")');
  ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'Control Center dark toggle');
  await page.click('#cc .tile:has-text("Dark Mode")');
  await page.mouse.click(700, 500);

  console.log('Menu bar');
  await page.click('#mbl .mb:has-text("Window")'); await page.waitForTimeout(150);
  ok(await page.$('#mdd') !== null, 'menu dropdown opens');
  await page.keyboard.press('Escape');
  await page.click('#mblogo'); await page.waitForTimeout(150);
  ok((await page.textContent('#mdd')).includes('Shut Down'), 'Apple-style menu has power options');
  await page.keyboard.press('Escape');

  console.log('Persistence, password & power');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await openApp('finder'); await shot('08-desktop');
  await page.reload(); await page.waitForSelector('#lock', { state: 'visible', timeout: 6000 }); await page.waitForTimeout(700);
  await page.click('#lock'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => AuraOS.FS.exists('/Users/user/demo/d.txt') && AuraOS.DB.set.wall === 2), 'files & settings persist across reload');
  ok(await page.evaluate(() => AuraOS.FS.read('/Users/user/Documents/Todo.txt')) === 'edited content', 'edited file persists');
  await page.evaluate(() => AuraOS.Apps.settings && AuraOS.launch('settings', { page: 'security' }));
  await page.fill('.window:last-child input[type=password]', 'secret'); await page.click('.window:last-child .btn:has-text("Set")'); await page.waitForTimeout(700);
  await page.keyboard.press('Control+l'); await page.waitForTimeout(700);
  await page.fill('#pw', 'wrong'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'flex', 'wrong password keeps lock');
  await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'none', 'correct password unlocks');
  await page.evaluate(() => { AuraOS.DB.set.pass = ''; });


  console.log('Window snapping');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await page.evaluate(() => AuraOS.launch('textedit')); await page.waitForTimeout(400);
  let sw = await page.$('.window:last-child'); let sb = await sw.boundingBox();
  await page.mouse.move(sb.x + 200, sb.y + 15); await page.mouse.down(); await page.mouse.move(2, 300, { steps: 6 });
  ok(await page.$eval('#snapPrev', e => e.style.display) === 'block', 'snap preview shows at screen edge');
  await page.mouse.up(); await page.waitForTimeout(500);
  sb = await sw.boundingBox();
  ok(Math.abs(sb.width - 720) < 3 && sb.x < 2, 'snap to left half');
  await shot('09-snap');
  await page.mouse.move(sb.x + 200, sb.y + 15); await page.mouse.down(); await page.mouse.move(700, 300, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(100);
  sb = await sw.boundingBox(); ok(sb.width < 720 && sb.width > 300, 'dragging out of snap restores size');
  await page.mouse.move(sb.x + 100, sb.y + 15); await page.mouse.down(); await page.mouse.move(600, 1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
  ok((await sw.boundingBox()).width >= 1430, 'drag to top edge maximizes');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w))); await page.waitForTimeout(300);

  console.log('Music');
  await openApp('music');
  await page.click('.window:last-child .tr:nth-child(2)'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => AuraOS.Player.playing && AuraOS.Player.idx === 1), 'click track plays it');
  ok(await page.evaluate(() => AuraOS.Player.ctx.state === 'running' && AuraOS.Player.step > 2), 'audio engine is scheduling notes');
  await shot('10-music');
  await page.click('.window:last-child .pp'); ok(await page.evaluate(() => !AuraOS.Player.playing), 'pause button');
  await page.click('.window:last-child .pp'); await page.click('.window:last-child button[title="Next"]');
  ok(await page.evaluate(() => AuraOS.Player.idx === 2 && AuraOS.Player.playing), 'next track');
  await page.click('.window:last-child button[title="Previous"]'); ok(await page.evaluate(() => AuraOS.Player.idx === 1), 'previous track');
  await page.click('#mbclock'); await page.waitForTimeout(500);
  ok((await page.textContent('#nc')).includes('Neon Drive'), 'Notification Center shows now playing');
  await page.click('#mbclock');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  ok(await page.evaluate(() => !AuraOS.Player.playing), 'closing Music stops playback');

  console.log('Photos');
  await openApp('photos');
  ok(await page.$$eval('.window:last-child .pgrid img', e => e.length) >= 6, 'Photos shows sample library');
  await page.click('.window:last-child .pgrid img:nth-child(2)'); await page.waitForTimeout(150);
  ok(await page.$eval('.window:last-child .pview', e => getComputedStyle(e).display) === 'flex', 'open photo viewer');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  ok((await page.evaluate(() => AuraOS.WM.of('photos')[0].photoState().view)).endsWith('.svg'), 'viewer next photo (arrow key)');
  await page.click('.window:last-child .tbtn:has-text("Set as Wallpaper")'); await page.waitForTimeout(300);
  ok(String(await page.evaluate(() => AuraOS.DB.set.wall)).startsWith('file:'), 'set photo as wallpaper');
  ok((await page.$eval('#wallpaper', e => e.style.background)).includes('url('), 'wallpaper renders image'); await shot('11-photos-wall');
  await page.click('.window:last-child .tbtn:has-text("Library")');
  await page.evaluate(() => AuraOS.applyTheme({ wall: 0 }));

  console.log('Calendar / Reminders / Widgets');
  await openApp('calendar');
  await page.click('.window:last-child .cc.today'); await page.fill('.window:last-child .split input', 'Dentist 3pm'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok((await page.textContent('.window:last-child .cc.today')).includes('Dentist'), 'calendar event added');
  ok(await page.evaluate(() => Object.values(AuraOS.DB.set.cal).flat().includes('Dentist 3pm')), 'calendar event persisted in settings');
  ok(await page.$('#widgets .wcal .ev') !== null, 'calendar widget marks day with event');
  await shot('12-calendar');
  await openApp('reminders');
  await page.fill('.window:last-child .toolbar input', 'Buy milk'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok((await page.textContent('#widgets')).includes('Buy milk'), 'reminder appears in desktop widget');
  await page.click('.window:last-child .rem .wt:has-text("Buy milk")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => AuraOS.DB.set.todos.find(t => t.t === 'Buy milk').d), 'toggle reminder done');
  ok(await page.$$eval('#widgets .wd', e => e.length) === 4, 'four desktop widgets (clock, calendar, reminders, weather)');
  await page.click('#mbclock'); await page.waitForTimeout(500); await shot('13-notification-center');
  ok(await page.$$eval('#nc .wd', e => e.length) >= 4, 'Notification Center has widgets');
  await page.click('#mbclock');
  await page.click('#widgets', { button: 'right', position: { x: 10, y: 10 } }); await page.click('.dd .it:has-text("Hide Widgets")');
  ok(await page.$$eval('#widgets .wd', e => e.length) === 0, 'hide widgets via context menu');
  await page.evaluate(() => { AuraOS.DB.set.widgets = true; AuraOS.Widgets.build(); });

  console.log('Clock');
  await openApp('clock');
  ok((await page.textContent('.window:last-child')).includes('Tokyo'), 'world clock lists cities');
  await page.click('.window:last-child .tabs div:has-text("Stopwatch")'); await page.click('.window:last-child .rbtn.g');
  await page.waitForTimeout(1200);
  const swt = await page.textContent('.window:last-child .big'); ok(swt !== '00:00.00', 'stopwatch runs (' + swt + ')');
  await page.click('.window:last-child .rbtn.r');
  const frozen = await page.textContent('.window:last-child .big'); await page.waitForTimeout(400);
  ok(frozen === await page.textContent('.window:last-child .big'), 'stopwatch stops');
  await page.click('.window:last-child .tabs div:has-text("Timer")');
  await page.fill('.window:last-child input[type=number] >> nth=0', '0'); await page.fill('.window:last-child input[type=number] >> nth=1', '2');
  await page.click('.window:last-child .rbtn.g'); await page.waitForTimeout(2600);
  ok((await page.textContent('#toasts')).includes('Time is up'), 'timer fires notification');
  await page.click('.window:last-child .tabs div:has-text("Alarm")');
  await page.click('.window:last-child .btn:has-text("Add Alarm")');
  ok(await page.evaluate(() => AuraOS.DB.set.alarms.length) === 1, 'alarm added');
  await shot('14-clock');

  console.log('2048');
  await openApp('game2048');
  ok(await page.evaluate(() => AuraOS.WM.of('game2048')[0].snapshot().g.filter(Boolean).length) === 2, '2048 starts with two tiles');
  await page.evaluate(() => AuraOS.WM.of('game2048')[0].setGrid([2,2,4,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]));
  await page.click('.window:last-child .g2'); await page.keyboard.press('ArrowLeft');
  const sn = await page.evaluate(() => AuraOS.WM.of('game2048')[0].snapshot());
  ok(sn.g[0] === 4 && sn.g[1] === 4 && sn.score === 4, '2048 merges tiles & scores');

  console.log('Finder: clipboard, import, download');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await openApp('finder'); await page.click('.window .sb:has-text("Documents")');
  await page.click('.window .ficon:has-text("Todo.txt")');
  await page.keyboard.press('Control+c');
  await page.click('.window .fgrid', { button: 'right', position: { x: 450, y: 300 } });
  await page.click('.dd .it:has-text("Paste")'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => AuraOS.FS.exists('/Users/user/Documents/Todo 2.txt')), 'copy + paste file');
  await page.click('.window .ficon:has-text("Todo 2.txt")', { button: 'right' });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.dd .it:has-text("Download")')]);
  ok(dl.suggestedFilename() === 'Todo 2.txt', 'download file to real computer');
  const fch = page.waitForEvent('filechooser');
  await page.click('.window .tbtn:has-text("Import")');
  await (await fch).setFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('imported!') }); await page.waitForTimeout(400);
  ok(await page.evaluate(() => AuraOS.FS.read('/Users/user/Documents/hello.txt')) === 'imported!', 'import file from real computer');
  await page.click('.window .ficon:has-text("hello.txt")', { button: 'right' }); await page.click('.dd .it:has-text("Move to Trash")'); await page.waitForTimeout(200);
  await page.click('.window .sb:has-text("Trash")'); await page.click('.window .ficon:has-text("hello.txt")', { button: 'right' }); await page.click('.dd .it:has-text("Put Back")'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => AuraOS.FS.exists('/Users/user/Documents/hello.txt')), 'Put Back restores to original folder');

  console.log('Mission Control / Alt+Tab / Dock');
  await page.evaluate(() => { AuraOS.launch('terminal'); AuraOS.launch('calculator'); }); await page.waitForTimeout(400);
  await page.keyboard.press('F3'); await page.waitForTimeout(300);
  ok(await page.$$eval('#mc .mcc', e => e.length) === 3, 'Mission Control lists all windows'); await shot('15-mission-control');
  await page.click('#mc .mcc:has-text("Terminal")'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => AuraOS.WM.active.app) === 'terminal', 'Mission Control focuses clicked window');
  await page.keyboard.down('Alt'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  ok(await page.$eval('#switcher', e => e.classList.contains('show')), 'Alt+Tab shows switcher'); await shot('16-switcher');
  await page.keyboard.up('Alt'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => AuraOS.WM.active.app) !== 'terminal', 'Alt+Tab switches to previous window');
  await page.click('.di[data-app="terminal"]', { button: 'right' }); await page.click('.dd .it:has-text("Remove from Dock")');
  ok(await page.evaluate(() => !AuraOS.DB.set.pinned.includes('terminal')), 'remove app from Dock');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  ok(await page.$('.di[data-app="terminal"]') === null, 'unpinned app leaves Dock when closed');

  console.log('Multiple users');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'users' })); await page.waitForTimeout(300);
  await page.fill('.window:last-child input[placeholder="Full name"]', 'Alex'); await page.fill('.window:last-child input[type=password]', 'pw1');
  await page.click('.window:last-child .btn:has-text("Add User")'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !!AuraOS.DB.users.alex && AuraOS.FS.isDir('/Users/alex/Documents')), 'create user with home folder');
  await page.evaluate(() => AuraOS.logout()); await page.waitForTimeout(700);
  ok(await page.$('#lock .users .avatar[data-user="alex"]') !== null, 'lock screen shows other users'); await shot('17-users');
  await page.click('#lock .users .avatar[data-user="alex"]'); await page.waitForTimeout(300);
  ok((await page.textContent('#lock .nm')) === 'Alex', 'switch to Alex');
  await page.fill('#pw', 'pw1'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => AuraOS.DB.current === 'alex' && !AuraOS.DB.set.cal['x'] && Object.keys(AuraOS.DB.set.cal).length === 0), 'Alex has separate settings/calendar');
  await page.evaluate(() => AuraOS.FS.write('/Users/alex/Desktop/alex.txt', 'hi')); await page.waitForTimeout(200);
  ok(await page.$$eval('#icons .ficon .lbl', e => e.map(x => x.textContent)).then(a => a.includes('alex.txt') && !a.includes('Welcome.txt')), "desktop shows only Alex's files");
  await page.evaluate(() => AuraOS.launch('terminal')); await page.waitForTimeout(300);
  await page.fill('.window:last-child .term input', 'pwd'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok((await page.textContent('.window:last-child .term')).includes('/Users/alex'), 'terminal home is /Users/alex');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await page.evaluate(() => AuraOS.logout()); await page.waitForTimeout(600);
  await page.click('#lock .users .avatar[data-user="user"]'); await page.waitForTimeout(300); await page.click('#lock'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => AuraOS.DB.current === 'user'), 'switch back to original user');

  console.log('Wi-Fi & network (honest in browser)');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'wifi' })); await page.waitForTimeout(900);
  let wt = await page.textContent('.window:last-child');
  ok(wt.includes('Connected') && wt.includes('203.0.113.9') && wt.includes('TestNet'), 'Wi-Fi page shows real connection info (IP, ISP)');
  ok(wt.includes('Web browsers deliberately hide Wi-Fi names'), 'browser does NOT fake a nearby-networks list');
  ok(await page.$('.window:last-child .netrow') === null, 'no fake network rows in browser');
  await page.evaluate(() => { window.auraNative = { wifi: { scan: async () => [{ ssid: 'HomeNet', signal: 80, security: 'WPA2', connected: true }, { ssid: 'Cafe', signal: 40, security: '' }] }, openNetworkSettings() { window.__openedNet = true; } }; AuraOS.launch('settings', { page: 'general' }); AuraOS.launch('settings', { page: 'wifi' }); });
  await page.waitForTimeout(400);
  await page.click('.window:last-child .btn:has-text("Scan")'); await page.waitForTimeout(500);
  wt = await page.textContent('.window:last-child');
  ok(wt.includes('HomeNet') && wt.includes('Cafe') && wt.includes('2 found'), 'desktop-app bridge: scan lists networks');
  await page.click('.window:last-child .btn:has-text("Open system Wi-Fi settings")');
  ok(await page.evaluate(() => window.__openedNet === true), 'desktop-app bridge: opens system Wi-Fi settings');
  await page.evaluate(() => { delete window.auraNative; });

  console.log('Bluetooth (mocked Web Bluetooth)');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'bluetooth' })); await page.waitForTimeout(400);
  ok((await page.textContent('.window:last-child')).includes('Ready'), 'Bluetooth page ready');
  await page.click('.window:last-child .btn:has-text("Add Device")'); await page.waitForTimeout(600);
  wt = await page.textContent('.window:last-child');
  ok(wt.includes('Test Buds') && wt.includes('Connected · 77%'), 'pair + connect shows device and battery');
  ok(await page.evaluate(() => AuraOS.DB.set.bt.some(d => d.id === 'bt-dev-1')), 'paired device remembered in settings');
  await page.click('.window:last-child .btn:has-text("Disconnect")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__btDev.gatt.connected === false), 'disconnect works');
  await page.click('.window:last-child .btn:has-text("Forget")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => AuraOS.DB.set.bt.length === 0), 'forget removes device');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Weather');
  await openApp('weather'); await page.waitForTimeout(700);
  wt = await page.textContent('.window:last-child');
  ok(wt.includes('21') && wt.includes('Clear'), 'weather shows current temperature + condition');
  ok((await page.textContent('.window:last-child .ttl')).includes('Testville'), 'location comes from IP lookup');
  ok((await page.textContent('#widgets [data-w=weather]')).includes('21'), 'desktop weather widget shows temperature');
  await page.evaluate(() => { AuraOS.DB.set.unit = 'f'; });
  ok(await page.evaluate(() => AuraOS.Weather.fmt(21.4)) === '71°F', '°C → °F conversion');
  await page.evaluate(() => { AuraOS.DB.set.unit = 'c'; });
  ok(await page.evaluate(async () => (await AuraOS.Weather.search('par'))[0].name) === 'Paris, Ile-de-France, FR', 'city search works');
  await shot('19-weather');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Camera (fake device)');
  await openApp('camera'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => AuraOS.WM.of('camera')[0].cameraState().live), 'camera stream is live');
  ok(await page.$eval('.window:last-child video', v => v.videoWidth > 0), 'video frames arrive');
  const picsBefore = await page.evaluate(() => Object.keys(AuraOS.FS.get('/Users/user/Pictures').c).length);
  await page.click('.window:last-child button[title="Take Photo"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(n => Object.keys(AuraOS.FS.get('/Users/user/Pictures').c).length === n + 1, picsBefore), 'photo saved to Pictures');
  await shot('20-camera');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.querySelectorAll('video').length === 0), 'closing Camera releases the video element');

  console.log('System Info');
  await openApp('sysinfo'); await page.waitForTimeout(400);
  wt = await page.textContent('.window:last-child');
  ok(['Aura OS', 'CPU threads', 'Screen', 'Time zone', 'Storage used'].every(k => wt.includes(k)), 'System Info lists real device facts');
  ok(wt.includes('1440×900') || wt.includes('1440') , 'screen size is the real one');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await openApp('terminal'); await term('sysinfo'); await term('weather');
  const t3 = await page.textContent('.window:last-child .term');
  ok(t3.includes('CPU threads') && t3.includes('Testville'), 'terminal sysinfo + weather commands');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Backup & restore');
  await page.evaluate(() => AuraOS.FS.write('/Users/user/Documents/backup-me.txt', 'precious'));
  await page.evaluate(() => AuraOS.launch('settings', { page: 'storage' })); await page.waitForTimeout(300);
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('.window:last-child .btn:has-text("Export Backup")')]);
  ok(/^aura-os-backup-\d{4}-\d\d-\d\d\.json$/.test(bk.suggestedFilename()), 'backup downloads as dated JSON');
  const bkPath = `${OUT}/backup.json`; await bk.saveAs(bkPath);
  const bkObj = JSON.parse(require('fs').readFileSync(bkPath, 'utf8'));
  ok(!!bkObj.fs && !!bkObj.users, 'backup holds fs + users');
  await page.evaluate(() => AuraOS.FS.trash('/Users/user/Documents/backup-me.txt')); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !AuraOS.FS.exists('/Users/user/Documents/backup-me.txt')), 'file removed before restore');
  const fch2 = page.waitForEvent('filechooser');
  await page.click('.window:last-child .btn:has-text("Restore Backup")');
  await (await fch2).setFiles(bkPath); await page.waitForTimeout(300);
  await Promise.all([page.waitForEvent('load'), page.click('#dlg .btn.pri')]);
  await page.waitForSelector('#lock', { state: 'visible', timeout: 6000 }); await page.waitForTimeout(700); await page.click('#lock'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => AuraOS.FS.read('/Users/user/Documents/backup-me.txt')) === 'precious', 'restore brings the file back');
  const fch3 = page.waitForEvent('filechooser');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'storage' })); await page.waitForTimeout(300);
  await page.click('.window:last-child .btn:has-text("Restore Backup")');
  await (await fch3).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') }); await page.waitForTimeout(400);
  ok((await page.textContent('#toasts')).includes('Not an Aura OS backup'), 'invalid backup file is rejected');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Cloud sync (mocked Supabase)');
  await page.evaluate(() => AuraOS.launch('settings', { page: 'cloud' })); await page.waitForTimeout(300);
  ok((await page.textContent('.window:last-child')).includes('Not signed in'), 'Cloud page starts signed out');
  await page.fill('.window:last-child input[type=email]', 'test@example.com'); await page.fill('.window:last-child input[type=password]', 'wrongpw');
  await page.click('.window:last-child button:has-text("Sign In")'); await page.waitForTimeout(500);
  ok((await page.textContent('.window:last-child')).includes('Invalid login credentials'), 'wrong password shows server error');
  ok(await page.evaluate(() => !AuraOS.Cloud.on), 'still signed out after bad login');
  await page.fill('.window:last-child input[type=password]', 'secret1');
  await page.click('.window:last-child button:has-text("Sign In")');
  await page.waitForFunction(() => AuraOS.Cloud.on && !AuraOS.Cloud.busy && AuraOS.Cloud.last, null, { timeout: 8000 });
  ok(await page.evaluate(() => AuraOS.Cloud.on && !AuraOS.Cloud.err), 'sign in works, first sync has no error');
  ok(Object.keys(SB.files).some(p => p.endsWith('Todo.txt')) && !!SB.settings, 'files + settings uploaded');
  ok(SB.settings.data.accent === '#bf5af2' && !('pass' in SB.settings.data), 'settings uploaded without password');
  await page.evaluate(() => AuraOS.FS.write('/Users/user/Documents/cloud-e2e.txt', 'v1'));
  const cs1 = await page.evaluate(() => AuraOS.Cloud.sync());
  ok(cs1.up === 1 && Object.values(SB.files).find(f => f.path.endsWith('cloud-e2e.txt')).content === 'v1', 'new file uploaded (1 item)');
  const cs2 = await page.evaluate(() => AuraOS.Cloud.sync());
  ok(cs2.up === 0 && cs2.down === 0, 'idle sync is a no-op');
  await page.evaluate(() => AuraOS.FS.trash('/Users/user/Documents/cloud-e2e.txt')); await page.waitForTimeout(100);
  await page.evaluate(() => AuraOS.Cloud.sync());
  ok(Object.values(SB.files).find(f => f.path.endsWith('cloud-e2e.txt')).deleted === true, 'delete becomes a tombstone');
  await page.evaluate(() => AuraOS.Cloud.wipeRemote());
  ok(Object.keys(SB.files).length === 0 && SB.settings === null, 'Delete Cloud Data wipes server copy');
  await page.evaluate(() => AuraOS.Cloud.signOut());
  ok(await page.evaluate(() => !AuraOS.Cloud.on), 'sign out');
  await shot('21-cloud');
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));

  console.log('Performance');
  await page.evaluate(() => AuraOS.applyTheme({ lite: true }));
  ok(await page.evaluate(() => document.documentElement.classList.contains('lite')), 'Reduce effects mode toggles');
  await page.evaluate(() => AuraOS.applyTheme({ lite: null }));
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const m0 = (await cdp.send('Performance.getMetrics')).metrics; const g = (m, n) => m.find(x => x.name === n).value;
  await page.evaluate(() => AuraOS.WM.wins.slice().forEach(w => AuraOS.WM.close(w)));
  await page.evaluate(() => { AuraOS.launch('finder'); AuraOS.launch('notes'); });
  await page.waitForTimeout(6000);
  const m1 = (await cdp.send('Performance.getMetrics')).metrics;
  const cpu = (g(m1, 'TaskDuration') - g(m0, 'TaskDuration')) / 6 * 100;
  console.log(`  · idle CPU (main thread, widgets + 2 windows): ${cpu.toFixed(2)}%   JS heap: ${(g(m1, 'JSHeapUsedSize') / 1048576).toFixed(1)} MB   DOM nodes: ${g(m1, 'Nodes')}`);
  ok(cpu < 5, 'idle CPU under 5% of one core');
  ok(g(m1, 'JSHeapUsedSize') < 60 * 1048576, 'JS heap under 60 MB');
  await shot('18-final-desktop');

  console.log('Runtime errors');
  ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
