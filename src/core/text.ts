import type { TextTable } from '../types/data';

/** 키로 문구를 찾고 `{name}` 자리를 채운다. 없는 키는 키 자체를 돌려준다. */
export function formatText(table: TextTable, key: string, vars?: Record<string, string | number>): string {
  const raw = table[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
