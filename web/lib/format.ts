export function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export function fmtDate(d: string, withYear = false): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    return dt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = fmtTime(iso);
  if (!time) return '';
  try {
    const dt = new Date(iso);
    const dateStr = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${dateStr}, ${time}`;
  } catch {
    return time;
  }
}

export function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
