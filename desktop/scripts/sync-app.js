// Builds the web app (minified when esbuild is available) and copies it into desktop/app for Electron.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..'), dest = path.join(__dirname, '..', 'app'), dist = path.join(root, 'dist');
execFileSync(process.execPath, [path.join(root, 'tools', 'build.js')], { stdio: 'inherit' });
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(dist, dest, { recursive: true });
fs.rmSync(path.join(dest, 'sw.js'), { force: true }); // the desktop app loads from disk; no service worker needed
console.log('Synced web app into desktop/app');
