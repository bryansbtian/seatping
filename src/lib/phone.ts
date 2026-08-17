
type CountryFormat = {
  code: string;
  groups: number[];
};

const COUNTRY_FORMATS: CountryFormat[] = [
  { code: "62", groups: [3, 4, 4] },
  { code: "60", groups: [2, 4, 4] },
  { code: "65", groups: [4, 4] },
  { code: "63", groups: [3, 3, 4] },
  { code: "66", groups: [2, 3, 4] },
  { code: "84", groups: [3, 4, 4] },
  { code: "852", groups: [4, 4] },
  { code: "971", groups: [2, 3, 4] },
  { code: "966", groups: [2, 3, 4] },
  { code: "91", groups: [5, 5] },
  { code: "81", groups: [2, 4, 4] },
  { code: "86", groups: [3, 4, 4] },
  { code: "82", groups: [2, 4, 4] },
  { code: "61", groups: [3, 3, 3] },
  { code: "44", groups: [4, 6] },
  { code: "1", groups: [3, 3, 4] },
];

function onlyDigits(v: string | null | undefined): string {
  return (v || "").replace(/\D+/g, "");
}

function stripLeadingZeros(v: string): string {
  return v.replace(/^0+/, "");
}

function chunk(digits: string, groups: number[]): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) {
      break;
    }
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  while (i < digits.length) {
    parts.push(digits.slice(i, i + 4));
    i += 4;
  }
  return parts.filter(Boolean).join("-");
}

function chunkGeneric(digits: string): string {
  return chunk(digits, [3]);
}

export function formatPhone(
  normalized: string | null | undefined,
  rawFallback?: string | null,
): string | null {
  const normDigits = onlyDigits(normalized);

  if (normDigits) {
    const match = COUNTRY_FORMATS.find((c) => normDigits.startsWith(c.code));
    if (match) {
      const national = stripLeadingZeros(normDigits.slice(match.code.length));
      if (!national) {
        return `+${match.code}`;
      }
      return `+${match.code} ${chunk(national, match.groups)}`;
    }
    return `+${chunkGeneric(normDigits)}`;
  }

  const rawDigits = stripLeadingZeros(onlyDigits(rawFallback));
  if (!rawDigits) {
    return null;
  }
  return chunkGeneric(rawDigits);
}
