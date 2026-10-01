/** Validates a JSON field that must be an array of distinct allowed strings. Returns an error message or null. */
export function validateEnumArray(value: unknown, allowed: readonly string[], field: string): string | null {
  if (!Array.isArray(value)) return `${field} must be an array of: ${allowed.join(', ')}`;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item)) {
      return `${field} contains "${String(item)}"; allowed values are: ${allowed.join(', ')}`;
    }
    if (seen.has(item)) return `${field} lists "${item}" more than once`;
    seen.add(item);
  }
  return null;
}
