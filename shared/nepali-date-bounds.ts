/**
 * BS calendar years the app can convert and validate.
 *
 * Upper bound matches `nepali-date-converter` (BS 2090 ≈ late 2033 AD).
 * When that package adds later years, raise `BS_YEAR_MAX` here and in tests.
 */
export const BS_YEAR_MIN = 2070;
export const BS_YEAR_MAX = 2090;

export function isBsYearInSupportedRange(year: number): boolean {
  return Number.isInteger(year) && year >= BS_YEAR_MIN && year <= BS_YEAR_MAX;
}
