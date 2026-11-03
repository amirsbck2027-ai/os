// End-to-end test for Aura OS. Run: node tests/e2e.js [url] [outDir]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = process.argv[3] || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
  const wins = () => page.evaluate(() => AuraOS.WM.wins.length);
  const openApp = async id => { await page.click(`.di[data-app="${id}"]`); await page.waitForTimeout(350); };

  console.log('Boot & lock');
  await page.goto(URL);
  await page.waitForTimeout(600); await shot('01-boot');
  await page.waitForSelector('#lock', { state: 'visible', timeout: 6000 });
  await page.waitForTimeout(700); await shot('02-lock');
  await page.click('#lock'); await page.waitForTimeout(800);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'none', 'unlock hides lock screen');
  ok(await page.$$eval('.di', e => e.length) >= 12, 'dock rendered');
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
  await page.click('.di[data-app="textedit"]'); await page.waitForTimeout(400);
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
  await page.fill('.window:last-child input[type=password]', 'secret'); await page.click('.window:last-child .btn:has-text("Set")');
  await page.keyboard.press('Control+l'); await page.waitForTimeout(700);
  await page.fill('#pw', 'wrong'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'flex', 'wrong password keeps lock');
  await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  ok(await page.$eval('#lock', e => getComputedStyle(e).display) === 'none', 'correct password unlocks');
  await page.evaluate(() => { AuraOS.DB.set.pass = ''; });

  console.log('Runtime errors');
  ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
