type Doc = Record<string, any>;

/**
 * Whether a row meets Strapi filters, for the tests' stand-ins of the Document Service. It knows the operators the
 * services use, on fields of the row itself: `$eq`, `$ne`, `$in`, `$lt`, and `$or` over a list of filters. Another
 * operator is a mistake in the service or in the test, so it throws. As in SQL, a field that is null or missing never
 * meets `$ne` or `$lt`.
 */
export const matches = (row: Doc, filters: Doc = {}): boolean =>
  Object.entries(filters).every(([field, condition]: [string, any]) => {
    if (field === '$or') return (condition as Doc[]).some((branch) => matches(row, branch));
    if ('$eq' in condition) return row[field] === condition.$eq;
    if ('$ne' in condition) return row[field] != null && row[field] !== condition.$ne;
    if ('$in' in condition) return condition.$in.includes(row[field]);
    if ('$lt' in condition) return row[field] != null && row[field] < condition.$lt;
    throw new Error(`These tests don't know the filter ${field}: ${JSON.stringify(condition)}`);
  });
