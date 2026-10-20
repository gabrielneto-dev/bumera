const CPF_LENGTH = 11;
const FIRST_CHECK_FACTOR = 10;
const SECOND_CHECK_FACTOR = 11;
const FIRST_CHECK_INDEX = 9;
const SECOND_CHECK_INDEX = 10;

/** Keeps only the digits of a CPF typed in any format. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, "");
}

function checkDigit(digits: readonly number[], firstFactor: number): number {
  const sum = digits.reduce((acc, digit, index) => acc + digit * (firstFactor - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

/** Expects 11 digits (see normalizeCpf); validates the two check digits. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  return (
    checkDigit(numbers.slice(0, FIRST_CHECK_INDEX), FIRST_CHECK_FACTOR) === numbers[FIRST_CHECK_INDEX] &&
    checkDigit(numbers.slice(0, SECOND_CHECK_INDEX), SECOND_CHECK_FACTOR) === numbers[SECOND_CHECK_INDEX]
  );
}

function assertLength(digits: string): void {
  if (digits.length !== CPF_LENGTH) throw new Error("CPF must have 11 digits");
}

export function formatCpf(digits: string): string {
  assertLength(digits);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** For screens and logs: only the last two digits stay visible. */
export function maskCpf(digits: string): string {
  assertLength(digits);
  return `***.***.***-${digits.slice(9)}`;
}
