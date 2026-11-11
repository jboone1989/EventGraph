/** Intro animation can round to a tiny negative value at zero; canvas.arc rejects negative radii. */
export const easeOutBack = (p: number): number =>
  Math.max(0, 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2);
