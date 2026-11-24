export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type RangeKey = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

export function resolveRange(range: RangeKey, from?: string, to?: string, today = toDateStr(new Date())): DateRange {
  if (range === 'custom' && from && to && from <= to) {
    const limitedFrom = diffDays(from, to) > 365 ? addDays(to, -365) : from;
    return { from: limitedFrom, to };
  }
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  return { from: addDays(today, -(days - 1)), to: today };
}

export function previousRange(range: DateRange): DateRange {
  const len = diffDays(range.from, range.to) + 1;
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}
