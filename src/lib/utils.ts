// Drops undefined keys so a PATCH only touches the fields the client sent.
export function compact<T extends Record<string, unknown>>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as never;
}

export const today = () => new Date().toISOString().slice(0, 10);

// Escapes % and _ so user text can be used inside ILIKE patterns.
export const like = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;
