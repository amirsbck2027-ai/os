// Copies the web app into desktop/app so Electron (and electron-builder) can package it.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), dest = path.join(__dirname, '..', 'app');
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(dest, f));
fs.cpSync(path.join(root, 'icons'), path.join(dest, 'icons'), { recursive: true });
console.log('Synced web app into desktop/app');
