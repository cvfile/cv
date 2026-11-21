// A fixed window rate limit per visitor address for the site's API (the aiconnect-hardening template). It keeps its counts in the
// process memory, which fits one server process; a site running several copies keeps them in a shared
// store (Redis, its database) with the same window and limit. The memory it takes is bounded: it counts
// `maxAddresses` addresses at once, drops each window as it ends, and refuses a new address while every
// place is taken. An IPv6 address is counted with its /64 network, the range one visitor is given, so
// a visitor who moves through the addresses of that range stays one visitor.

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ADDRESSES = 10_000;
const IPV4_IN_IPV6 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const NETWORK_GROUPS = 4;
const ADDRESS_GROUPS = 8;

// What an address is counted under: an IPv4 address as it is, also when it is written inside an IPv6
// one, and the first four groups of an IPv6 address.
export function networkOf(address) {
  const embedded = IPV4_IN_IPV6.exec(address);
  if (embedded || !address.includes(':')) {
    return embedded ? embedded[1] : address;
  }
  const [head, tail] = address.toLowerCase().split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const skipped = tail === undefined ? 0 : ADDRESS_GROUPS - first.length - last.length;
  const groups = [...first, ...new Array(Math.max(skipped, 0)).fill('0'), ...last];
  return groups.slice(0, NETWORK_GROUPS).map((group) => group.replace(/^0+(?=.)/, '')).join(':');
}

export function createRateLimit({
  limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS, maxAddresses = DEFAULT_MAX_ADDRESSES,
} = {}) {
  // The windows in the order they started, which is the order a Map keeps what it is given.
  const windows = new Map();
  const secondsLeft = (entry, now) => Math.ceil((entry.start + windowMs - now) / 1000);

  // The windows that ended are the first ones, so the reading stops at the first one still running.
  function dropEnded(now) {
    for (const [network, entry] of windows) {
      if (now - entry.start < windowMs) {
        return;
      }
      windows.delete(network);
    }
  }

  // Counts one request from `address`. Returns { ok, retryAfterSeconds }.
  return function take(address, now = Date.now()) {
    dropEnded(now);
    const network = networkOf(address);
    const entry = windows.get(network);
    if (entry) {
      entry.count += 1;
      return { ok: entry.count <= limit, retryAfterSeconds: secondsLeft(entry, now) };
    }
    if (windows.size >= maxAddresses) {
      const [oldest] = windows.values();
      return { ok: false, retryAfterSeconds: secondsLeft(oldest, now) };
    }
    windows.set(network, { start: now, count: 1 });
    return { ok: true, retryAfterSeconds: 0 };
  };
}
