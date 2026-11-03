# Aura OS

A macOS/iOS-styled desktop operating system that runs entirely in the browser (no install, no backend).

**Run:** open `index.html` in a modern browser (or `python3 -m http.server` and visit localhost:8000).

## Included
- Boot screen, lock screen (optional password), restart / shut down
- Menu bar with app menus, clock, Wi-Fi/battery, Control Center, Spotlight (Ctrl/Cmd+Space), Launchpad (F4)
- Window manager: drag, 8-way resize, minimize, zoom, close, focus, Dock with magnification
- Persistent virtual file system (localStorage): create/rename/move/copy/trash, drag & drop
- Apps: Finder, Terminal (ls, cd, mkdir, cat, echo >, cp, mv, rm, tree, open, ps, kill, theme, …), TextEdit, Notes, Calculator, Safari, Sketch, Snake, Activity Monitor, Preview, System Settings
- Light/dark mode, accent colors, wallpapers, dock size, volume/brightness

## New in this version
- Music (WebAudio synth, 4 tracks, visualizer), Photos (library, viewer, set as wallpaper, import), Calendar, Clock (world clock, alarms, stopwatch, timer), Reminders, 2048
- Desktop widgets + Notification Center (analog clock, calendar, reminders, system stats, now playing), Do Not Disturb
- Window snapping (drag to left/right/top edge), Mission Control (F3), Alt+Tab switcher
- Multiple user accounts with separate home folders, settings and passwords
- Finder: cut/copy/paste, import files from your computer, download files, Put Back from Trash
- Performance: pauses work when tab hidden/minimized, one shared clock tick, rAF-throttled drag/resize/dock, optional "Reduce transparency & motion" (auto on low-power devices). Idle ≈ 1% of one core, ~5 MB JS heap.

## Test
`NODE_PATH=$(npm root -g) node tests/e2e.js http://localhost:8765/index.html ./shots` (Playwright, 99 checks)
