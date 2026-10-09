// localStorage wrappers. Everything is per-browser; there is no server.

const PREFIX = 'jiangbao.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // private mode or storage full: the game still works, it just forgets
  }
}

export const DEFAULT_SETTINGS = { master: 0.9, music: 0.45, sfx: 0.8, sensitivity: 1, quality: 'high', view: 'third', muted: false, stick: true, stickSide: 'left' };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function boardKey(diff) {
  return `board.${diff}`;
}

// Keeps the best 20 runs per difficulty. Returns the 1-based rank of this run, or 0.
export function submitRun(diff, entry) {
  const list = load(boardKey(diff), []);
  list.push(entry);
  list.sort((a, b) => a.time - b.time);
  const trimmed = list.slice(0, 20);
  save(boardKey(diff), trimmed);
  const rank = trimmed.indexOf(entry) + 1;
  return rank;
}

export function getBoard(diff) {
  return load(boardKey(diff), []);
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export function formatTimeZh(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1);
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
