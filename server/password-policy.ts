/** Letters + digits required; length is configurable per call site. */
export function isStrongPassword(
  password: string | undefined | null,
  minLength: number,
): boolean {
  const value = password?.trim() ?? "";
  if (value.length < minLength) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (!/\d/.test(value)) return false;
  return true;
}
