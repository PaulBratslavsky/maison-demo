/** Short, human-readable appointment reference. Uniqueness is checked by the caller. */
export const generateReference = (random: () => number = Math.random): string =>
  `APT-${1000 + Math.floor(random() * 9000)}`;
