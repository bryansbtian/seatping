// Reusable phone-number display formatting. Used by the Guests CRM (table +
// detail drawer) so phone formatting lives in one place instead of inline in
// components.
//
// The Guest CRM stores two things:
//   - `normalizedPhone`: digits-only, country code INCLUDED (e.g. "628118308669"
//     for +62, "12069313369" for +1). This is the reliable display source.
//   - `phone`: the raw local number WITHOUT country code (e.g. "8118308669").
//
// Prefer `normalizedPhone`. When it's present we know the country code and can
// render "+62 812-3456-7890". When only the raw local number is available we
// group it readably without a country code. Unknown country codes still format
// safely (a "+" with grouped digits) rather than breaking.

type CountryFormat = {
  code: string; // dial code, digits only
  groups: number[]; // how to chunk the national number; remainder chunked by 4
};

// Focused set of dial codes (region-first), longest-match wins. Anything not
// listed falls back to generic international grouping.
const COUNTRY_FORMATS: CountryFormat[] = [
  { code: "62", groups: [3, 4, 4] }, // Indonesia
  { code: "60", groups: [2, 4, 4] }, // Malaysia
  { code: "65", groups: [4, 4] }, // Singapore
  { code: "63", groups: [3, 3, 4] }, // Philippines
  { code: "66", groups: [2, 3, 4] }, // Thailand
  { code: "84", groups: [3, 4, 4] }, // Vietnam
  { code: "852", groups: [4, 4] }, // Hong Kong
  { code: "971", groups: [2, 3, 4] }, // UAE
  { code: "966", groups: [2, 3, 4] }, // Saudi Arabia
  { code: "91", groups: [5, 5] }, // India
  { code: "81", groups: [2, 4, 4] }, // Japan
  { code: "86", groups: [3, 4, 4] }, // China
  { code: "82", groups: [2, 4, 4] }, // South Korea
  { code: "61", groups: [3, 3, 3] }, // Australia
  { code: "44", groups: [4, 6] }, // UK
  { code: "1", groups: [3, 3, 4] }, // US / Canada
];

function onlyDigits(v: string | null | undefined): string {
  return (v || "").replace(/\D+/g, "");
}

function stripLeadingZeros(v: string): string {
  return v.replace(/^0+/, "");
}

/** Chunk `digits` using `groups`, then split any remainder into groups of 4. */
function chunk(digits: string, groups: number[]): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  while (i < digits.length) {
    parts.push(digits.slice(i, i + 4));
    i += 4;
  }
  return parts.filter(Boolean).join("-");
}

/** Generic international grouping when the country code is unknown: 3 then 4s. */
function chunkGeneric(digits: string): string {
  return chunk(digits, [3]);
}

/**
 * Format a phone number for display.
 * @param normalized digits-only number including country code (preferred).
 * @param rawFallback raw local number (no country code) used only when
 *   `normalized` is absent.
 * @returns a formatted string, or null when there's no usable number.
 */
export function formatPhone(
  normalized: string | null | undefined,
  rawFallback?: string | null,
): string | null {
  const normDigits = onlyDigits(normalized);

  if (normDigits) {
    const match = COUNTRY_FORMATS.find((c) => normDigits.startsWith(c.code));
    if (match) {
      const national = stripLeadingZeros(normDigits.slice(match.code.length));
      if (!national) return `+${match.code}`;
      return `+${match.code} ${chunk(national, match.groups)}`;
    }
    // Unknown country code: keep it safe and readable.
    return `+${chunkGeneric(normDigits)}`;
  }

  // No normalized number: format the raw local number (no country code known).
  const rawDigits = stripLeadingZeros(onlyDigits(rawFallback));
  if (!rawDigits) return null;
  return chunkGeneric(rawDigits);
}
