// Production build: minifies the inline CSS + JS of index.html (esbuild) and writes dist/.
// Usage: node tools/build.js   (set AURA_NO_MINIFY=1 to copy sources unchanged)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
let esbuild; try { esbuild = require('esbuild'); } catch { esbuild = null; }

(async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const before = Buffer.byteLength(html);
  if (esbuild && !process.env.AURA_NO_MINIFY) {
    // CSS blocks
    const cssRe = /<style>([\s\S]*?)<\/style>/g; let m, parts = [];
    while ((m = cssRe.exec(html))) parts.push([m[0], m[1]]);
    for (const [full, css] of parts) { const r = await esbuild.transform(css, { loader: 'css', minify: true }); html = html.replace(full, () => `<style>${r.code.trim()}</style>`); }
    // the main (largest) script block
    const jsRe = /<script>([\s\S]*?)<\/script>/g, scripts = [];
    while ((m = jsRe.exec(html))) scripts.push([m[0], m[1]]);
    for (const [full, js] of scripts) { if (js.length < 2000) continue; const r = await esbuild.transform(js, { loader: 'js', minify: true, target: 'es2022', legalComments: 'none' }); html = html.replace(full, () => `<script>${r.code.trim()}</script>`); }
    html = html.replace(/>\s+</g, m => m.includes('\n') ? '><' : m).replace(/<!--[\s\S]*?-->/g, '');
  }
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace(/__BUILD__/g, hash));
  fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
  const after = Buffer.byteLength(html), gz = zlib.gzipSync(html, { level: 9 }).length, br = zlib.brotliCompressSync(html).length;
  const k = n => (n / 1024).toFixed(1) + ' KB';
  console.log(`index.html ${k(before)} -> ${k(after)} (gzip ${k(gz)}, brotli ${k(br)}) build ${hash}${esbuild ? '' : '  [esbuild missing: not minified]'}`);
})().catch(e => { console.error(e); process.exit(1); });
