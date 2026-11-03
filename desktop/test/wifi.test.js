const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../wifi');

test('splitTerse handles escaped colons', () => {
  assert.deepEqual(W.splitTerse('*:My\\:Net:80:WPA2'), ['*', 'My:Net', '80', 'WPA2']);
  assert.deepEqual(W.splitTerse(' :Back\\\\slash:10:'), [' ', 'Back\\slash', '10', '']);
});

test('parseNmcli: dedupes, skips hidden, marks connected, sorts', () => {
  const out = W.parseNmcli([' :Cafe:42:WPA2', '*:HomeNet:81:WPA2 WPA3', ' :HomeNet:55:WPA2', ' ::30:WPA2', ' :OpenWifi:20:', ''].join('\n'));
  assert.deepEqual(out.map(n => n.ssid), ['HomeNet', 'Cafe', 'OpenWifi']);
  assert.equal(out[0].connected, true); assert.equal(out[0].signal, 81);
  assert.equal(out[2].security, 'Open'); assert.equal(out[1].connected, false);
});

const NETSH = `
Interface name : Wi-Fi
There are 3 networks currently visible.

SSID 1 : HomeNet
    Network type            : Infrastructure
    Authentication          : WPA2-Personal
    Encryption              : CCMP
    BSSID 1                 : aa:bb:cc:dd:ee:01
         Signal             : 70%
    BSSID 2                 : aa:bb:cc:dd:ee:02
         Signal             : 92%

SSID 2 : Guest
    Network type            : Infrastructure
    Authentication          : Open
    Encryption              : None
    BSSID 1                 : 11:22:33:44:55:66
         Signal             : 33%

SSID 3 :
    Network type            : Infrastructure
    Authentication          : WPA2-Personal
    BSSID 1                 : 00:00:00:00:00:01
         Signal             : 99%
`;
test('parseNetsh: takes strongest BSSID, drops hidden, marks current', () => {
  const out = W.parseNetsh(NETSH, 'Guest');
  assert.deepEqual(out.map(n => [n.ssid, n.signal, n.security, n.connected]), [['Guest', 33, 'Open', true], ['HomeNet', 92, 'WPA2-Personal', false]]);
});
test('parseNetshInterfaces', () => {
  assert.equal(W.parseNetshInterfaces('    State                  : connected\r\n    SSID                   : HomeNet\r\n'), 'HomeNet');
  assert.equal(W.parseNetshInterfaces('    State                  : disconnected\r\n'), null);
  assert.equal(W.parseNetshInterfaces(''), null);
});

const MAC = JSON.stringify({ SPAirPortDataType: [{ spairport_airport_interfaces: [{
  _name: 'en0',
  spairport_current_network_information: { _name: 'HomeNet', spairport_security_mode: 'spairport_security_mode_wpa2_personal', spairport_signal_noise: '-55 dBm / -92 dBm' },
  spairport_airport_other_local_wireless_networks: [
    { _name: 'Cafe', spairport_security_mode: 'spairport_security_mode_none', spairport_signal_noise: '-80 dBm / -92 dBm' },
    { _name: 'Mystery', spairport_security_mode: 'spairport_security_mode_wpa3_personal' },
    { _name: '<redacted>', spairport_security_mode: 'spairport_security_mode_wpa2_personal' },
    { _name: 'HomeNet', spairport_security_mode: 'spairport_security_mode_wpa2_personal' },
  ] }] }] });
test('parseMacProfiler: converts dBm, readable security, skips redacted, dedupes', () => {
  const out = W.parseMacProfiler(MAC);
  assert.deepEqual(out.map(n => n.ssid), ['HomeNet', 'Cafe', 'Mystery']);
  assert.equal(out[0].connected, true); assert.equal(out[0].signal, 90); assert.equal(out[0].security, 'WPA2');
  assert.equal(out[1].security, 'Open'); assert.equal(out[1].signal, 40);
  assert.equal(out[2].signal, null); assert.equal(out[2].security, 'WPA3');
});
test('parseMacProfiler: bad JSON gives empty list', () => assert.deepEqual(W.parseMacProfiler('nope'), []));
test('dbmToPct clamps', () => { assert.equal(W.dbmToPct(-30), 100); assert.equal(W.dbmToPct(-100), 0); assert.equal(W.dbmToPct(-120), 0); });
test('scan rejects unsupported platform', async () => { await assert.rejects(W.scan('plan9'), /not supported/); });
