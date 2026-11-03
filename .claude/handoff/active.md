---
saved-at: 2026-11-03T03:55:17Z
saved-at-sha: 0743da4
saved-at-branch: aura-os
saved-from-cwd: /home/user/os
---

Pick up Aura OS (single-file web OS, `index.html`, branch `aura-os`) at phase 5 of the "serious / own app" plan.

**First, ask the user to approve (or run themselves) deleting the temp Supabase test login** `aura-test@example.invalid` (id `11111111-aaaa-4bbb-8ccc-000000000001`) from project `forge-fitness` (`ahluywhfadsxwqsbzlko`). The `execute_sql` delete timed out waiting for user approval. Its aura_ rows were already wiped. Do not touch the user's other Supabase projects/tables (`tp-osip`, `forge_profiles`).

**Next steps, in order:**
1. Fix `tests/e2e.js` for UI changes (4 desktop widgets now, weather widget; Settings pages/sidebar changed; toolbar buttons now SVG icons). Add tests for Wi-Fi/Bluetooth (mock `navigator.bluetooth`), Weather, Camera (launch chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`), System Info, backup/restore, Cloud page (mock Supabase via `page.route`; real test is `tests/cloud-live.js`, needs `AURA_TEST_EMAIL/PASS`). Playwright needs `proxy:{server:HTTPS_PROXY,bypass:'localhost,127.0.0.1'}` for real internet.
2. PWA: `manifest.webmanifest`, `sw.js` (offline app shell), PNG icons, install button.
3. Electron wrapper in `desktop/`: `preload.js` exposes `window.auraNative` with `wifi.scan()` (nmcli / netsh / system_profiler parsers, unit-test them), `bluetooth` (`onList/select/cancel` via `select-bluetooth-device`), `openNetworkSettings()`; `<webview>` for Safari. Xvfb exists for Linux testing. Add GitHub Actions to build .exe/.dmg/AppImage and deploy Pages.
4. Update README, republish artifact (`https://claude.ai/artifact/3Jhu8BkYXxYnJK7Qu71hUC`), commit/push.

**Constraints / decisions already made:** user chose Supabase tables in `forge-fitness` (done: `aura_files`, `aura_settings`, RLS, schema in `supabase/schema.sql`) and PWA + Electron. Storage is IndexedDB; passwords PBKDF2. Browsers cannot read real Wi-Fi SSIDs: do not fake it, only Electron lists them. Windows .exe cannot be tested in the cloud, say so. Do not create a PR unless asked. User likes short caveman-style replies (caveman mode on until they say stop).

**Patch scripts** used earlier live in the session scratchpad only, not the repo. Edit `index.html` directly now.
