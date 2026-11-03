// Wi-Fi scanning for the Aura desktop app. Pure parsers (unit-tested) + a thin runner.
// Returns [{ ssid, signal /* 0-100 or null */, security, connected }] sorted strongest first.
const { execFile } = require('child_process');

const dbmToPct = d => Math.max(0, Math.min(100, Math.round(2 * (d + 100))));

// nmcli -t escapes ':' and '\' with a backslash.
function splitTerse(line) {
  const out = []; let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) cur += line[++i];
    else if (c === ':') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

// nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list
function parseNmcli(text) {
  const best = new Map();
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const [use, ssid, sig, sec] = splitTerse(line);
    if (!ssid) continue; // hidden networks have no name
    const n = { ssid, signal: Number(sig) || 0, security: (sec || '').trim() || 'Open', connected: use.trim() === '*' };
    const old = best.get(ssid);
    if (!old || n.signal > old.signal || n.connected) best.set(ssid, { ...n, connected: n.connected || (old && old.connected) || false });
  }
  return sortNets([...best.values()]);
}

// netsh wlan show networks mode=bssid (English Windows)
function parseNetsh(text, currentSsid) {
  const nets = []; let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    let m = raw.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/);
    if (m) { cur = { ssid: m[1].trim(), signal: 0, security: 'Open', connected: false }; nets.push(cur); continue; }
    if (!cur) continue;
    if ((m = raw.match(/^\s*Authentication\s*:\s*(.*)$/))) cur.security = /open/i.test(m[1]) ? 'Open' : m[1].trim();
    else if ((m = raw.match(/^\s*Signal\s*:\s*(\d+)\s*%/))) cur.signal = Math.max(cur.signal, Number(m[1]));
  }
  const byName = new Map();
  for (const n of nets) { if (!n.ssid) continue; const o = byName.get(n.ssid); if (!o || n.signal > o.signal) byName.set(n.ssid, n); }
  const out = [...byName.values()];
  if (currentSsid) out.forEach(n => { n.connected = n.ssid === currentSsid; });
  return sortNets(out);
}

// netsh wlan show interfaces -> connected SSID or null
function parseNetshInterfaces(text) {
  const state = String(text).match(/^\s*State\s*:\s*(.+)$/m);
  if (!state || !/^connected$/i.test(state[1].trim())) return null;
  const m = String(text).match(/^\s*SSID\s*:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

const MAC_SEC = {
  spairport_security_mode_none: 'Open', spairport_security_mode_wep: 'WEP',
  spairport_security_mode_wpa_personal: 'WPA', spairport_security_mode_wpa2_personal: 'WPA2',
  spairport_security_mode_wpa3_personal: 'WPA3', spairport_security_mode_wpa3_transition: 'WPA2/WPA3',
  spairport_security_mode_wpa2_enterprise: 'WPA2 Enterprise', spairport_security_mode_wpa3_enterprise: 'WPA3 Enterprise',
};
// system_profiler SPAirPortDataType -json
function parseMacProfiler(text) {
  let j; try { j = JSON.parse(text); } catch { return []; }
  const ifs = (((j.SPAirPortDataType || [])[0] || {}).spairport_airport_interfaces) || [];
  const nets = [];
  for (const itf of ifs) {
    const cur = itf.spairport_current_network_information;
    const add = (n, connected) => {
      const ssid = n._name; if (!ssid || /^<redacted>$/i.test(ssid)) return;
      const dbm = String(n.spairport_signal_noise || '').match(/(-\d+)\s*dBm/);
      nets.push({ ssid, signal: dbm ? dbmToPct(Number(dbm[1])) : null,
        security: MAC_SEC[n.spairport_security_mode] || (n.spairport_security_mode || '').replace(/^spairport_security_mode_/, '').replace(/_/g, ' ') || 'Open', connected });
    };
    if (cur) add(cur, true);
    (itf.spairport_airport_other_local_wireless_networks || []).forEach(n => add(n, false));
  }
  const seen = new Map(); nets.forEach(n => { const o = seen.get(n.ssid); if (!o || n.connected) seen.set(n.ssid, n); });
  return sortNets([...seen.values()]);
}

function sortNets(l) { return l.sort((a, b) => (b.connected - a.connected) || ((b.signal || 0) - (a.signal || 0)) || a.ssid.localeCompare(b.ssid)); }

const run = (cmd, args, timeout = 20000) => new Promise((res, rej) =>
  execFile(cmd, args, { timeout, maxBuffer: 8e6, windowsHide: true }, (e, out, err) => e ? rej(Object.assign(e, { stderr: err })) : res(out)));

async function scan(platform = process.platform) {
  if (platform === 'linux') {
    try { return parseNmcli(await run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'yes'])); }
    catch (e) { throw new Error(e.code === 'ENOENT' ? 'nmcli (NetworkManager) is not installed' : (e.stderr || e.message).toString().trim()); }
  }
  if (platform === 'win32') {
    let cur = null; try { cur = parseNetshInterfaces(await run('netsh', ['wlan', 'show', 'interfaces'])); } catch {}
    try { return parseNetsh(await run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']), cur); }
    catch (e) { throw new Error((e.stderr || e.message).toString().trim() || 'netsh failed'); }
  }
  if (platform === 'darwin') {
    const nets = parseMacProfiler(await run('system_profiler', ['SPAirPortDataType', '-json'], 40000));
    if (!nets.length) throw new Error('No networks returned. macOS hides Wi-Fi names until Location Services is allowed for this app.');
    return nets;
  }
  throw new Error('Wi-Fi scanning is not supported on ' + platform);
}

module.exports = { scan, parseNmcli, parseNetsh, parseNetshInterfaces, parseMacProfiler, splitTerse, dbmToPct };
