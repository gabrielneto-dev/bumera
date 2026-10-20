const COUNTRY_CODE = "55";
const MOBILE_LENGTH = 11;
const LANDLINE_LENGTH = 10;
const AREA_CODE_PATTERN = /^[1-9][1-9]$/;
const MOBILE_E164_PATTERN = /^\+55[1-9][1-9]9\d{8}$/;

/**
 * Normalizes a Brazilian phone number to E.164 (+55DDNNNNNNNNN) or returns null.
 * Mobile numbers have 9 digits starting with 9; landlines have 8 digits starting with 2-5.
 */
export function normalizeBrPhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+") && !trimmed.startsWith(`+${COUNTRY_CODE}`)) return null;

  let digits = trimmed.replace(/\D/g, "");
  const withCountryCode = digits.startsWith(COUNTRY_CODE) && [12, 13].includes(digits.length);
  if (withCountryCode) digits = digits.slice(COUNTRY_CODE.length);

  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (!AREA_CODE_PATTERN.test(areaCode)) return null;

  const isMobile = digits.length === MOBILE_LENGTH && subscriber.startsWith("9");
  const isLandline = digits.length === LANDLINE_LENGTH && /^[2-5]/.test(subscriber);
  if (!isMobile && !isLandline) return null;

  return `+${COUNTRY_CODE}${digits}`;
}

/** WhatsApp needs a mobile number. */
export function isMobileE164(e164: string): boolean {
  return MOBILE_E164_PATTERN.test(e164);
}

/** "(11) 98765-4321" for display; returns the input unchanged when it is not a Brazilian number. */
export function formatBrPhone(e164: string): string {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}
