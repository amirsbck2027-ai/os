// Real device information for the Aura desktop app. Pure parsers are unit-tested; runners are thin.
const os = require('os'), fs = require('fs'), { execFile } = require('child_process');

const run = (cmd, args, timeout = 8000) => new Promise((res, rej) =>
  execFile(cmd, args, { timeout, maxBuffer: 4e6, windowsHide: true }, (e, out) => e ? rej(e) : res(out)));

// ---- CPU load from two os.cpus() snapshots (0-100) ----
function cpuTimes(cpus) { return cpus.reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 }); }
function cpuLoad(prev, cur) {
  if (!prev) return null;
  const di = cur.idle - prev.idle, dt = cur.total - prev.total;
  return dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100))) : 0;
}

// ---- battery parsers ----
function parsePmset(text) { // pmset -g batt
  const t = String(text), m = t.match(/(\d+)%;\s*([^;]+?);\s*(?:(\d+:\d+) remaining|\(no estimate\)|(?:not charging)|\S*)/i);
  if (!m) return null;
  const src = /AC Power/i.test(t) ? 'ac' : /Battery Power/i.test(t) ? 'battery' : null;
  const st = m[2].trim().toLowerCase();
  return { percent: +m[1], charging: st === 'charging' || st === 'finishing charge', state: st, source: src, remaining: m[3] || null };
}
function parseSysfsBattery(files) { // {capacity,status,energy_full,energy_full_design,cycle_count,voltage_now,technology}
  if (files.capacity == null) return null;
  const n = k => files[k] != null && files[k] !== '' ? Number(files[k]) : null;
  const full = n('energy_full') ?? n('charge_full'), design = n('energy_full_design') ?? n('charge_full_design');
  const status = String(files.status || '').trim();
  return { percent: n('capacity'), charging: /^charging$/i.test(status), state: status.toLowerCase(), health: full && design ? Math.round(full / design * 100) : null, cycles: n('cycle_count'), technology: files.technology ? String(files.technology).trim() : null };
}
function parseWinBattery(text) { // PowerShell: Get-CimInstance Win32_Battery | ConvertTo-Json
  let j; try { j = JSON.parse(text); } catch { return null; }
  if (Array.isArray(j)) j = j[0]; if (!j) return null;
  const st = Number(j.BatteryStatus); // 1 discharging, 2 AC, 3 full, 4 low, 5 critical, 6-9 charging
  return { percent: Number(j.EstimatedChargeRemaining), charging: st === 2 || (st >= 6 && st <= 9), state: st === 3 ? 'full' : (st === 1 || st === 4 || st === 5) ? 'discharging' : 'charging', remaining: j.EstimatedRunTime && j.EstimatedRunTime < 71582788 ? `${Math.floor(j.EstimatedRunTime / 60)}:${String(j.EstimatedRunTime % 60).padStart(2, '0')}` : null };
}
async function battery(platform = process.platform) {
  try {
    if (platform === 'linux') {
      const base = '/sys/class/power_supply', d = fs.readdirSync(base).find(x => /^BAT/i.test(x)); if (!d) return null;
      const f = {}; for (const k of ['capacity', 'status', 'energy_full', 'energy_full_design', 'charge_full', 'charge_full_design', 'cycle_count', 'technology']) { try { f[k] = fs.readFileSync(`${base}/${d}/${k}`, 'utf8').trim(); } catch {} }
      return parseSysfsBattery(f);
    }
    if (platform === 'darwin') return parsePmset(await run('pmset', ['-g', 'batt']));
    if (platform === 'win32') return parseWinBattery(await run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime | ConvertTo-Json']));
  } catch {}
  return null;
}

// ---- current Wi-Fi connection ----
function parseNetshConnection(text) {
  const t = String(text), g = re => { const m = t.match(re); return m ? m[1].trim() : null; };
  if (!/^\s*State\s*:\s*connected/mi.test(t)) return null;
  return { ssid: g(/^\s*SSID\s*:\s*(.+)$/m), bssid: g(/^\s*BSSID\s*:\s*(.+)$/m), signal: +(g(/^\s*Signal\s*:\s*(\d+)%/m) || 0) || null, rateMbps: +(g(/^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)/m) || 0) || null, radio: g(/^\s*Radio type\s*:\s*(.+)$/m), channel: +(g(/^\s*Channel\s*:\s*(\d+)/m) || 0) || null, security: g(/^\s*Authentication\s*:\s*(.+)$/m) };
}
function parseNmcliConnection(text) { // nmcli -t -f ACTIVE,SSID,BSSID,SIGNAL,RATE,CHAN,SECURITY dev wifi
  const { splitTerse } = require('./wifi');
  for (const line of String(text).split('\n')) {
    if (!line.startsWith('yes:')) continue;
    // BSSID contains escaped colons, splitTerse unescapes them
    const [, ssid, bssid, sig, rate, chan, sec] = splitTerse(line);
    return { ssid, bssid, signal: +sig || null, rateMbps: parseFloat(rate) || null, channel: +chan || null, security: sec || 'Open', radio: null };
  }
  return null;
}
function parseMacConnection(text) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const itf = (((j.SPAirPortDataType || [])[0] || {}).spairport_airport_interfaces || [])[0] || {}, c = itf.spairport_current_network_information;
  if (!c || !c._name || /redacted/i.test(c._name)) return c ? { ssid: null, redacted: true } : null;
  const dbm = String(c.spairport_signal_noise || '').match(/(-\d+)\s*dBm/);
  return { ssid: c._name, bssid: null, signal: dbm ? Math.max(0, Math.min(100, Math.round(2 * (+dbm[1] + 100)))) : null, rateMbps: Number(c.spairport_network_rate) || null, radio: c.spairport_network_phymode || null, channel: parseInt(c.spairport_network_channel) || null, security: String(c.spairport_security_mode || '').replace(/^spairport_security_mode_/, '').replace(/_/g, ' ') };
}
async function wifiCurrent(platform = process.platform) {
  try {
    if (platform === 'linux') return parseNmcliConnection(await run('nmcli', ['-t', '-f', 'ACTIVE,SSID,BSSID,SIGNAL,RATE,CHAN,SECURITY', 'dev', 'wifi']));
    if (platform === 'win32') return parseNetshConnection(await run('netsh', ['wlan', 'show', 'interfaces']));
    if (platform === 'darwin') return parseMacConnection(await run('system_profiler', ['SPAirPortDataType', '-json'], 30000));
  } catch {}
  return null;
}

// ---- static system info ----
async function disks() {
  const out = [];
  for (const p of (process.platform === 'win32' ? ['C:\\'] : ['/'])) {
    try { const s = await fs.promises.statfs(p); out.push({ mount: p, total: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch {}
  }
  return out;
}
function network() {
  const o = [], ifs = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifs)) for (const a of list || []) if (!a.internal && a.family === 'IPv4') o.push({ name, ip: a.address, mac: a.mac });
  return o;
}
function cpuInfo() { const c = os.cpus(); return { model: c[0] ? c[0].model.replace(/\s+/g, ' ').trim() : 'Unknown', cores: c.length, mhz: c[0] ? c[0].speed : null }; }
async function info(extra = {}) {
  return { cpu: cpuInfo(), mem: { total: os.totalmem(), free: os.freemem() }, os: { platform: process.platform, type: os.type(), release: os.release(), version: typeof os.version === 'function' ? os.version() : '', arch: os.arch(), hostname: os.hostname(), uptime: os.uptime(), user: os.userInfo().username }, disks: await disks(), net: network(), battery: await battery(), ...extra };
}

module.exports = { cpuTimes, cpuLoad, parsePmset, parseSysfsBattery, parseWinBattery, parseNetshConnection, parseNmcliConnection, parseMacConnection, battery, wifiCurrent, info, network, cpuInfo, disks };
