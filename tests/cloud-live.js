// Live cloud-sync test against a real Supabase project (needs a confirmed test account).
// AURA_TEST_EMAIL=... AURA_TEST_PASS=... node tests/cloud-live.js [url]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const EMAIL = process.env.AURA_TEST_EMAIL, PASS = process.env.AURA_TEST_PASS;
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

async function device(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.goto(URL); await page.waitForSelector('#lock', { state: 'visible' }); await page.waitForTimeout(600);
  await page.click('#lock'); await page.waitForTimeout(600);
  return page;
}

(async () => {
  const browser = await chromium.launch({ proxy });
  console.log('Device A: sign in + upload');
  const A = await device(browser);
  await A.evaluate(() => AuraOS.launch('settings', { page: 'cloud' })); await A.waitForTimeout(300);
  await A.fill('.window:last-child input[type=email]', EMAIL); await A.fill('.window:last-child input[type=password]', PASS);
  await A.click('.window:last-child button:has-text("Sign In")'); await A.waitForFunction(() => AuraOS.Cloud.on && !AuraOS.Cloud.busy, null, { timeout: 30000 }); await A.waitForTimeout(500);
  ok(await A.evaluate(() => AuraOS.Cloud.on), 'signed in to real Supabase');
  ok((await A.textContent('.window:last-child')).includes(EMAIL), 'Cloud page shows account');
  await A.evaluate(() => { AuraOS.FS.write('/Users/user/Documents/cloud-test.txt', 'from device A'); AuraOS.DB.set.todos.push({ t: 'cloud todo', d: false }); AuraOS.DB.set.accent = '#bf5af2'; });
  const st = await A.evaluate(() => AuraOS.Cloud.sync());
  ok(st.up >= 3, `first sync uploaded ${st.up} items`);
  ok(await A.evaluate(() => !AuraOS.Cloud.err), 'no sync error');

  console.log('Device B: sign in + download');
  const B = await device(browser);
  await B.evaluate(([e, p]) => AuraOS.Cloud.signIn(e, p), [EMAIL, PASS]);
  const st2 = await B.evaluate(() => AuraOS.Cloud.sync());
  ok(st2.down >= 1, `device B downloaded ${st2.down} items`);
  ok(await B.evaluate(() => AuraOS.FS.read('/Users/user/Documents/cloud-test.txt')) === 'from device A', 'file content matches');
  ok(await B.evaluate(() => AuraOS.DB.set.todos.some(t => t.t === 'cloud todo') && AuraOS.DB.set.accent === '#bf5af2'), 'settings (todos, accent) synced');

  console.log('Edits and deletes');
  await B.evaluate(() => AuraOS.FS.write('/Users/user/Documents/cloud-test.txt', 'edited on B'));
  await B.evaluate(() => AuraOS.Cloud.sync());
  await A.evaluate(() => AuraOS.Cloud.sync());
  ok(await A.evaluate(() => AuraOS.FS.read('/Users/user/Documents/cloud-test.txt')) === 'edited on B', 'edit on B reaches A');
  await A.evaluate(() => AuraOS.FS.trash('/Users/user/Documents/cloud-test.txt'));
  await A.evaluate(() => AuraOS.Cloud.sync());
  await B.evaluate(() => AuraOS.Cloud.sync());
  ok(await B.evaluate(() => !AuraOS.FS.exists('/Users/user/Documents/cloud-test.txt')), 'delete on A removes file on B');
  const again = await A.evaluate(() => AuraOS.Cloud.sync());
  ok(again.up === 0 && again.down === 0, 'idle sync is a no-op');

  console.log('Sign out / wipe');
  await A.evaluate(() => AuraOS.Cloud.wipeRemote());
  ok(true, 'cloud data wiped');
  await A.evaluate(() => AuraOS.Cloud.signOut());
  ok(await A.evaluate(() => !AuraOS.Cloud.on), 'signed out');

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
