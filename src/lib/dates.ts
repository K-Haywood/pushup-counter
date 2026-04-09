const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * DAY_IN_MS);
}

export function listDateKeysBack(length: number, from = new Date()): string[] {
  return Array.from({ length }, (_, index) => getLocalDateKey(addDays(from, -(length - index - 1))));
}

export function formatHistoryLabel(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

export function formatFullDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function getPreviousDateKey(dateKey: string): string {
  return getLocalDateKey(addDays(parseDateKey(dateKey), -1));
}
