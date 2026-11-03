# Aura OS

A macOS/iOS-styled desktop operating system that runs entirely in the browser (no install, no backend).

**Run:** open `index.html` in a modern browser (or `python3 -m http.server` and visit localhost:8000).

## Included
- Boot screen, lock screen (optional password), restart / shut down
- Menu bar with app menus, clock, Wi-Fi/battery, Control Center, Spotlight (Ctrl/Cmd+Space), Launchpad (F4)
- Window manager: drag, 8-way resize, minimize, zoom, close, focus, Dock with magnification
- Persistent virtual file system (IndexedDB): create/rename/move/copy/trash, drag & drop
- Apps: Finder, Terminal (ls, cd, mkdir, cat, echo >, cp, mv, rm, tree, open, ps, kill, theme, …), TextEdit, Notes, Calculator, Safari, Sketch, Snake, Activity Monitor, Preview, System Settings
- Light/dark mode, accent colors, wallpapers, dock size, volume/brightness

## New in this version
- Music (WebAudio synth, 4 tracks, visualizer), Photos (library, viewer, set as wallpaper, import), Calendar, Clock (world clock, alarms, stopwatch, timer), Reminders, 2048
- Desktop widgets + Notification Center (analog clock, calendar, reminders, system stats, now playing), Do Not Disturb
- Window snapping (drag to left/right/top edge), Mission Control (F3), Alt+Tab switcher
- Multiple user accounts with separate home folders, settings and passwords
- Finder: cut/copy/paste, import files from your computer, download files, Put Back from Trash
- Performance: pauses work when tab hidden/minimized, one shared clock tick, rAF-throttled drag/resize/dock, optional "Reduce transparency & motion" (auto on low-power devices). Idle ≈ 1% of one core, ~5 MB JS heap.

## Three desktops in one
Settings > Desktop Style (or the Control Center tile, or tell Aura "switch to windows"):
- **macOS style**: menu bar, floating magnifying Dock, Launchpad.
- **Windows style**: bottom taskbar with Start button, Start menu (all apps, search, power), tray clock. Windows key or Ctrl+Esc opens Start.
- **Linux style**: GNOME-like top bar with Activities, vertical side dock.
Windows snap, maximize and resize respect each layout.

## Aura Assistant (your twist)
Spotlight, the Start menu and the Aura app understand plain commands: `open weather`, `dark mode`, `accent purple`, `timer 5 minutes`, `focus 25`, `remind me to stretch`, `note buy eggs`, `weather`, `my ip`, `volume 40`, `switch to linux`, `12*7`. It is rule-based and fully offline, not an AI model, and says so when it does not understand.

## Apps
Finder, Terminal, TextEdit, Notes, Calculator, Safari, Sketch, Preview, Music, Photos, Calendar, Clock, Reminders, Weather, Camera, System Info, Activity Monitor, Snake, 2048, plus new:
- **Code**: editor with line numbers, auto-indent, runs JavaScript in a sandbox (console output, errors), live HTML preview.
- **Sheets**: spreadsheet with formulas (`SUM AVERAGE MIN MAX COUNT ROUND ABS SQRT POW IF`), save as `.sheet`, export CSV.
- **Maps**: OpenStreetMap with real place search and "my location".
- **Focus**: Pomodoro timer, turns on Do Not Disturb, generated rain / ocean / brown / white noise, daily session count.
- **Voice Memos**: real microphone recording saved into Music.
- **Tetris** and **Minesweeper**.

## Real device data (not made up)
Aura OS reads your actual device wherever the platform allows it, and says so when it cannot.

| | Browser / PWA | Desktop app (Electron) |
|---|---|---|
| Battery level, charging | yes (Chrome, Edge, Android) | yes, plus health %, cycles, time left (Linux sysfs, macOS pmset, Windows WMI) |
| Wi-Fi | online state, latency, IP, ISP, speed test | also the connected network: name, signal, link speed, channel; nearby networks list |
| Bluetooth | Web Bluetooth pairing (Chrome, Edge) | same, with a native device picker |
| CPU, memory, GPU, disks, displays | thread count and rounded RAM only | real model, cores, RAM, GPU, disk space, network adapters |
| Activity Monitor | no per-process data (shows nothing invented) | live CPU load, memory, process list |
| Camera, microphone, location | yes | yes |

Browsers deliberately hide Wi-Fi names and hardware details. Nothing is faked: unavailable data is labelled as such.

## Performance
- Boot to lock screen in about 0.7 s. Idle CPU about 0.2% of one core, about 3 MB JS heap.
- `npm run build` minifies to `dist/` (about 86 KB gzip, 71 KB brotli). One file, no framework, no network needed after first load.
- Service worker serves instantly from cache and refreshes in the background.
- Work pauses when the tab is hidden or a window is minimized. Dock only re-renders when something visible changes. Window dragging is frame-throttled. Wallpapers are generated lazily as SVG and rasterized once by the browser.
- Optional "Reduce transparency and motion" (automatic on low-power devices).

## Apps
Core: Finder (tabs, tags), Terminal, TextEdit, Notes, Calculator, Safari, Preview, Music, Photos, Calendar, Clock, Reminders, Weather, Camera, System Info, Settings, App Store, Aura Assistant.
Installable from the App Store: Code, Sheets, Maps, Focus, Voice Memos, Sketch, Media (audio and video), PDF Reader, Converter, Vault (password generator), Activity Monitor, Tetris, Minesweeper, 2048, Snake.
Files can be tagged with colors (Finder context menu, sidebar, and `tag:red` in Spotlight).

## Cloud, backup, install
- **Cloud Sync**: Supabase, files and settings. Schema in `supabase/schema.sql`; use your own project under Settings > Cloud Sync > Advanced.
- **Backup / Restore**: Settings > Storage.
- **PWA**: host `dist/` over HTTPS (workflow included: `.github/workflows/pages.yml`), then Settings > General > Install.
- **Desktop app**: `cd desktop && npm install && npm start`, or `npm run dist` for an installer. Push a `v*` tag to build .exe, .dmg, .AppImage and .deb in GitHub Actions. Builds are unsigned (Windows SmartScreen and macOS Gatekeeper warn on first run). macOS asks for Location permission before it shows Wi-Fi names.

## Test
- Web: `NODE_PATH=$(npm root -g) node tests/e2e.js http://localhost:8765/index.html ./shots` (Playwright, ~250 checks; network services and Supabase are mocked, fake camera, fake Web Bluetooth)
- Live cloud: `AURA_TEST_EMAIL=... AURA_TEST_PASS=... node tests/cloud-live.js`
- Battery + Wi-Fi in browser (fake Battery API, online/offline): `NODE_PATH=$(npm root -g) node tests/devices.js http://localhost:8765/index.html`
- Desktop parsers (Wi-Fi, battery, system): `cd desktop && npm test`
- Desktop app smoke (Linux): `cd desktop && xvfb-run -a node scripts/smoke.js`
