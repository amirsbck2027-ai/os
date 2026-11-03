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

## Real device features
- **Wi-Fi & Network**: real online state, latency, public IP, ISP, location, speed test. Browsers cannot read nearby Wi-Fi names, so the web version says so instead of faking a list. The desktop app lists real networks (nmcli / netsh / system_profiler).
- **Bluetooth**: real pairing via Web Bluetooth (Chrome, Edge, desktop app): connect, battery level, forget.
- **Weather** (Open-Meteo), **Camera** (take photos into Pictures), **System Info** (real CPU threads, screen, memory, GPU, storage).
- **Cloud Sync**: sign in with email, files and settings sync through Supabase (free tier). Schema in `supabase/schema.sql`; set your own project under Settings > Cloud Sync > Advanced.
- **Backup / Restore**: Settings > Storage exports everything to one JSON file.

## Install as an app
**PWA** (any browser): host the folder over HTTPS (GitHub Pages workflow included: `.github/workflows/pages.yml`), open it, then Settings > General > Install, or the browser's Install / Add to Home Screen. Works offline after first load.

**Desktop app** (Electron, in `desktop/`):
```
cd desktop && npm install && npm start      # run
npm run dist                                # build installer for this OS
```
Push a `v*` tag, or run the *Build desktop apps* workflow, to build `.exe` (Windows), `.dmg` (macOS), `.AppImage` / `.deb` (Linux) in GitHub Actions. Builds are unsigned: Windows SmartScreen and macOS Gatekeeper will warn on first run. The Windows build has not been run on a real Windows machine by the author. Linux was tested; macOS and Windows parsers are unit-tested against sample output only.

The desktop app adds: real nearby Wi-Fi list, a native Bluetooth device picker, and a Safari with no iframe limits (`<webview>`). macOS asks for Location permission before it shows Wi-Fi names.

## Test
- Web: `NODE_PATH=$(npm root -g) node tests/e2e.js http://localhost:8765/index.html ./shots` (Playwright, ~220 checks; network services and Supabase are mocked, fake camera, fake Web Bluetooth)
- Live cloud: `AURA_TEST_EMAIL=... AURA_TEST_PASS=... node tests/cloud-live.js`
- Desktop parsers: `cd desktop && npm test`
- Desktop app smoke (Linux): `cd desktop && xvfb-run -a node scripts/smoke.js`
