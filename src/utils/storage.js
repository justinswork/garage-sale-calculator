const KEY = 'gsc:eventHostMap';

function readMap() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}

export function getDeviceHostId(eventId) {
  return readMap()[eventId] || null;
}

export function setDeviceHostId(eventId, hostId) {
  const map = readMap();
  map[eventId] = hostId;
  writeMap(map);
}

export function clearDeviceHostId(eventId) {
  const map = readMap();
  delete map[eventId];
  writeMap(map);
}

const RECENT_KEY = 'gsc:recentEvents';

export function getRecentEvents() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushRecentEvent(entry) {
  const list = getRecentEvents().filter((e) => e.id !== entry.id);
  list.unshift({ ...entry, lastOpenedAt: Date.now() });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {}
}
