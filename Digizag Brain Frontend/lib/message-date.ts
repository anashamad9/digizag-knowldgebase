// Provider timestamps can be ISO strings, Unix seconds, or Unix milliseconds.
// Missing/invalid dates stay unknown; never substitute the import date.
export function messageDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const millis = /^\d{13}$/.test(raw)
    ? Number(raw)
    : /^\d{10}(?:\.\d+)?$/.test(raw)
      ? Number(raw) * 1000
      : typeof value === "string" && /[a-zT:/-]/i.test(raw)
        ? Date.parse(raw)
        : NaN;
  return Number.isFinite(millis) && Math.abs(millis) <= 8640000000000000
    ? new Date(millis).toISOString()
    : null;
}
