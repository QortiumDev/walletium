const STORAGE_KEY = 'walletium-contact-mru';
const MAX_ENTRIES = 5;

export function getRecentContactNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentContactName(name: string): string[] {
  const existing = getRecentContactNames().filter(
    (n) => n.toLowerCase() !== name.toLowerCase()
  );
  const next = [name, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
