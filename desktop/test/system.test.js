const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../system');

test('cpuLoad from snapshots', () => {
  const a = S.cpuTimes([{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }]);
  const b = S.cpuTimes([{ times: { user: 200, nice: 0, sys: 150, idle: 850, irq: 0 } }]);
  assert.equal(S.cpuLoad(a, b), 75);
  assert.equal(S.cpuLoad(null, b), null);
  assert.equal(S.cpuLoad(b, b), 0);
});
test('parsePmset on battery', () => {
  const r = S.parsePmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t87%; discharging; 4:12 remaining present: true");
  assert.deepEqual([r.percent, r.charging, r.source, r.remaining, r.state], [87, false, 'battery', '4:12', 'discharging']);
});
test('parsePmset charging on AC', () => {
  const r = S.parsePmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t54%; charging; 1:20 remaining present: true");
  assert.deepEqual([r.percent, r.charging, r.source], [54, true, 'ac']);
});
test('parsePmset charged / no estimate', () => {
  const r = S.parsePmset("Now drawing from 'AC Power'\n -InternalBattery-0\t100%; charged; 0:00 remaining present: true");
  assert.equal(r.percent, 100); assert.equal(r.charging, false);
  assert.equal(S.parsePmset('nothing here'), null);
});
test('parseSysfsBattery computes health', () => {
  const r = S.parseSysfsBattery({ capacity: '64', status: 'Discharging\n', energy_full: '40000000', energy_full_design: '50000000', cycle_count: '212', technology: 'Li-ion' });
  assert.deepEqual([r.percent, r.charging, r.health, r.cycles, r.technology], [64, false, 80, 212, 'Li-ion']);
  assert.equal(S.parseSysfsBattery({}), null);
  assert.equal(S.parseSysfsBattery({ capacity: '10', status: 'Charging' }).charging, true);
});
test('parseWinBattery', () => {
  const r = S.parseWinBattery(JSON.stringify({ EstimatedChargeRemaining: 42, BatteryStatus: 1, EstimatedRunTime: 125 }));
  assert.deepEqual([r.percent, r.charging, r.remaining], [42, false, '2:05']);
  assert.equal(S.parseWinBattery(JSON.stringify([{ EstimatedChargeRemaining: 99, BatteryStatus: 2, EstimatedRunTime: 71582788 }]))[('charging')], true);
  assert.equal(S.parseWinBattery('x'), null);
});
test('parseNetshConnection', () => {
  const t = '    Name                   : Wi-Fi\r\n    State                  : connected\r\n    SSID                   : HomeNet\r\n    BSSID                  : aa:bb:cc:dd:ee:ff\r\n    Radio type             : 802.11ax\r\n    Authentication         : WPA2-Personal\r\n    Channel                : 36\r\n    Receive rate (Mbps)    : 866.7\r\n    Signal                 : 91%\r\n';
  assert.deepEqual(S.parseNetshConnection(t), { ssid: 'HomeNet', bssid: 'aa:bb:cc:dd:ee:ff', signal: 91, rateMbps: 866.7, radio: '802.11ax', channel: 36, security: 'WPA2-Personal' });
  assert.equal(S.parseNetshConnection('    State : disconnected'), null);
});
test('parseNmcliConnection handles escaped BSSID', () => {
  const t = 'no:Cafe:AA\\:BB\\:CC\\:DD\\:EE\\:01:40:54 Mbit/s:6:WPA2\nyes:HomeNet:AA\\:BB\\:CC\\:DD\\:EE\\:FF:78:270 Mbit/s:44:WPA2 WPA3\n';
  const r = S.parseNmcliConnection(t);
  assert.deepEqual([r.ssid, r.bssid, r.signal, r.rateMbps, r.channel, r.security], ['HomeNet', 'AA:BB:CC:DD:EE:FF', 78, 270, 44, 'WPA2 WPA3']);
  assert.equal(S.parseNmcliConnection('no:X:Y:1:1:1:\n'), null);
});
test('parseMacConnection', () => {
  const j = JSON.stringify({ SPAirPortDataType: [{ spairport_airport_interfaces: [{ spairport_current_network_information: { _name: 'HomeNet', spairport_signal_noise: '-60 dBm / -92 dBm', spairport_network_channel: '149 (5GHz, 80MHz)', spairport_network_phymode: '802.11ax', spairport_network_rate: 1200, spairport_security_mode: 'spairport_security_mode_wpa3_personal' } }] }] });
  const r = S.parseMacConnection(j);
  assert.deepEqual([r.ssid, r.signal, r.channel, r.rateMbps, r.radio, r.security], ['HomeNet', 80, 149, 1200, '802.11ax', 'wpa3 personal']);
  assert.deepEqual(S.parseMacConnection(JSON.stringify({ SPAirPortDataType: [{ spairport_airport_interfaces: [{ spairport_current_network_information: { _name: '<redacted>' } }] }] })), { ssid: null, redacted: true });
  assert.equal(S.parseMacConnection('bad'), null);
});
test('info() returns real values on this machine', async () => {
  const i = await S.info();
  assert.ok(i.cpu.cores >= 1 && i.mem.total > 0 && i.os.platform === process.platform);
});
