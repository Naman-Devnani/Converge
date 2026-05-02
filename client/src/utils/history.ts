export interface HistoryEntry {
  sessionId:   string;
  sessionName: string;
  joinedAt:    number;
}

const KEY         = 'meetsync_history';
const MAX_ENTRIES = 5;

export function getHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

export function addToHistory(entry: HistoryEntry): void {
  const list = getHistory().filter(e => e.sessionId !== entry.sessionId);
  list.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export function removeFromHistory(sessionId: string): void {
  const list = getHistory().filter(e => e.sessionId !== sessionId);
  localStorage.setItem(KEY, JSON.stringify(list));
}
