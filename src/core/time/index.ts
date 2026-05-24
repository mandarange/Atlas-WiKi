export function nowIso(): string { return new Date().toISOString(); }
export function isPastIso(value: string | undefined): boolean { return Boolean(value && Date.parse(value) < Date.now()); }
