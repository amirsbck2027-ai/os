// Battery + Wi-Fi/network behaviour in the browser build, with a controllable fake Battery API.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/cloudflare\.com\/cdn-cgi\/trace/, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'ip=203.0.113.9\nloc=XX\ncolo=TST\n' }));
  await ctx.route(/ipwho\.is/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, city: 'Testville', connection: { isp: 'TestNet' } }) }));
  await ctx.addInitScript(() => {
    const bat = Object.assign(new EventTarget(), { level: 0.8, charging: false, chargingTime: Infinity, dischargingTime: 7200 });
    window.__bat = bat; navigator.getBattery = async () => bat;
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#lock', { state: 'visible' }); await p.click('#lock'); await p.waitForTimeout(800);
  const mb = () => p.$eval('#mbbat', e => e.textContent + '|' + e.title + '|' + e.style.display);
  ok((await mb()).startsWith('80%'), 'menu bar shows 80%');
  ok((await mb()).includes('On battery'), 'tooltip says On battery');
  await p.evaluate(() => { __bat.level = 0.15; __bat.dispatchEvent(new Event('levelchange')); }); await p.waitForTimeout(200);
  ok((await mb()).startsWith('15%'), 'level change updates menu bar');
  ok(await p.$eval('#mbbat svg', e => /ff453a|255,\s?69|red/i.test(e.outerHTML)), 'low battery turns red');
  await p.evaluate(() => { __bat.charging = true; __bat.level = 0.5; __bat.dispatchEvent(new Event('chargingchange')); __bat.dispatchEvent(new Event('levelchange')); }); await p.waitForTimeout(200);
  ok((await mb()).includes('Charging') && (await mb()).startsWith('50%'), 'charging state + level update');
  await p.evaluate(() => AuraOS.launch('settings')); await p.waitForTimeout(400);
  await p.click('.window .sb:has-text("Battery")'); await p.waitForTimeout(300);
  const t = await p.textContent('.window:last-child');
  ok(/50\s?%/.test(t), 'Settings > Battery shows 50%'); ok(/charg/i.test(t), 'Settings > Battery shows charging');
  await p.click('.window .sb:has-text("Wi-Fi")'); await p.waitForTimeout(800);
  const w = await p.textContent('.window:last-child');
  ok(/online|connected/i.test(w), 'Wi-Fi page shows online'); ok(w.includes('203.0.113.9'), 'Wi-Fi page shows real IP from trace');
  ok(w.includes('TestNet'), 'Wi-Fi page shows ISP');
  await ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.waitForTimeout(500);
  ok(/offline/i.test(await p.textContent('.window:last-child')) || /offline/i.test(await p.$eval('#mbwifi', e => e.title || e.outerHTML).catch(() => '')), 'offline is reported');
  await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(800);
  ok(/online|connected/i.test(await p.textContent('.window:last-child')), 'back online is reported');
  ok(errs.length === 0, 'no page errors ' + errs.join(';'));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
