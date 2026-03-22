/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Cross-platform host network helpers.
 *
 * Provides a deterministic best-effort LAN IP selection for status/UI use.
 */

const os = require('os');

function getInterfaceEntries() {
  const all = os.networkInterfaces ? os.networkInterfaces() : {};
  const entries = [];
  for (const [iface, addrList] of Object.entries(all || {})) {
    for (const addr of Array.isArray(addrList) ? addrList : []) {
      if (!addr || typeof addr !== 'object') continue;
      entries.push({
        iface: String(iface || ''),
        address: String(addr.address || ''),
        family: String(addr.family || ''),
        internal: addr.internal === true
      });
    }
  }
  return entries;
}

function isUsableIpv4(entry) {
  if (!entry) return false;
  if (entry.internal) return false;
  if (entry.family !== 'IPv4') return false;
  if (!entry.address) return false;
  if (entry.address.startsWith('169.254.')) return false; // link-local
  if (entry.address === '0.0.0.0') return false;
  return true;
}

function scoreInterfaceName(name) {
  const n = String(name || '').toLowerCase();
  if (/^(eth|en|eno|enp|ens)/.test(n)) return 100;
  if (/^(wlan|wifi|wi-fi|wl)/.test(n)) return 90;
  if (/^(bond|br|bridge)/.test(n)) return 70;
  if (/^(tun|tap|wg|zt)/.test(n)) return 40;
  return 10;
}

function listLanIpv4() {
  const candidates = getInterfaceEntries().filter(isUsableIpv4);
  candidates.sort((a, b) => {
    const s = scoreInterfaceName(b.iface) - scoreInterfaceName(a.iface);
    if (s !== 0) return s;
    return a.iface.localeCompare(b.iface);
  });
  return candidates;
}

function getPrimaryLanIpv4() {
  const list = listLanIpv4();
  return list.length > 0 ? list[0].address : null;
}

module.exports = {
  getInterfaceEntries,
  listLanIpv4,
  getPrimaryLanIpv4
};

