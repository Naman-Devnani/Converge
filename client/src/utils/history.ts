export interface HistoryEntry {
  sessionId:   string;
  sessionName: string;
  joinedAt:    number;
}

const KEY         = 'converge_history';
const MAX_ENTRIES = 5;

// M-8/L-5: Same format used by the server — only alphanumeric + hyphen/underscore, 6–64 chars.
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// M-8: Type-guard so corrupted or tampered localStorage data is silently dropped.
function isValidEntry(e: unknown): e is HistoryEntry {
  return (
    typeof e === 'object' && e !== null &&
    typeof (e as Record<string, unknown>).sessionId   === 'string' &&
    SESSION_ID_RE.test((e as HistoryEntry).sessionId) &&
    typeof (e as Record<string, unknown>).sessionName === 'string' &&
    typeof (e as Record<string, unknown>).joinedAt    === 'number'
  );
}

export function getHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidEntry);
  } catch { return []; }
}

export function addToHistory(entry: HistoryEntry): void {
  // L-5: Reject entries with an invalid sessionId before persisting.
  if (!SESSION_ID_RE.test(entry.sessionId)) return;
  const list = getHistory().filter(e => e.sessionId !== entry.sessionId);
  list.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export function removeFromHistory(sessionId: string): void {
  const list = getHistory().filter(e => e.sessionId !== sessionId);
  localStorage.setItem(KEY, JSON.stringify(list));
}
