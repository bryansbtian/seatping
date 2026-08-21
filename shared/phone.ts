import { AsYouType, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { COUNTRY_CODES } from "./countryCodes.js";

type PhoneFormat = {
  pattern: string;
  example: string;
};

export const MAX_NATIONAL_DIGITS = 15;

const MIN_NATIONAL_DIGITS = 5;

const DEFAULT_FORMAT: PhoneFormat = { pattern: "###-###-####", example: "5551234567" };

const PHONE_FORMATS: Record<string, PhoneFormat> = {
  "1": { pattern: "(###) ###-####", example: "5551234567" },
  "7": { pattern: "(###) ###-##-##", example: "9123456789" },
  "20": { pattern: "##-####-####", example: "1001234567" },
  "27": { pattern: "##-###-####", example: "711234567" },
  "30": { pattern: "###-###-####", example: "6912345678" },
  "31": { pattern: "#-########", example: "612345678" },
  "32": { pattern: "###-##-##-##", example: "470123456" },
  "33": { pattern: "#-##-##-##-##", example: "612345678" },
  "34": { pattern: "###-##-##-##", example: "612345678" },
  "36": { pattern: "##-###-####", example: "201234567" },
  "39": { pattern: "###-###-####", example: "3123456789" },
  "40": { pattern: "###-###-###", example: "712345678" },
  "41": { pattern: "##-###-##-##", example: "791234567" },
  "43": { pattern: "###-#######", example: "6641234567" },
  "44": { pattern: "####-######", example: "7400123456" },
  "45": { pattern: "##-##-##-##", example: "20123456" },
  "46": { pattern: "##-###-##-##", example: "701234567" },
  "47": { pattern: "###-##-###", example: "40612345" },
  "48": { pattern: "###-###-###", example: "512345678" },
  "49": { pattern: "###-#######", example: "15123456789" },
  "51": { pattern: "###-###-###", example: "912345678" },
  "52": { pattern: "##-####-####", example: "5512345678" },
  "54": { pattern: "##-####-####", example: "1123456789" },
  "55": { pattern: "(##) #####-####", example: "11912345678" },
  "56": { pattern: "#-####-####", example: "912345678" },
  "57": { pattern: "###-###-####", example: "3211234567" },
  "58": { pattern: "###-#######", example: "4121234567" },
  "60": { pattern: "##-###-####", example: "123456789" },
  "61": { pattern: "###-###-###", example: "412345678" },
  "62": { pattern: "###-####-####", example: "81234567890" },
  "63": { pattern: "###-###-####", example: "9171234567" },
  "64": { pattern: "##-###-####", example: "211234567" },
  "65": { pattern: "####-####", example: "81234567" },
  "66": { pattern: "##-###-####", example: "812345678" },
  "81": { pattern: "##-####-####", example: "9012345678" },
  "82": { pattern: "##-####-####", example: "1012345678" },
  "84": { pattern: "###-###-###", example: "912345678" },
  "86": { pattern: "###-####-####", example: "13123456789" },
  "90": { pattern: "###-###-##-##", example: "5301234567" },
  "91": { pattern: "#####-#####", example: "9812345678" },
  "92": { pattern: "###-#######", example: "3011234567" },
  "94": { pattern: "##-###-####", example: "712345678" },
  "212": { pattern: "###-######", example: "650123456" },
  "233": { pattern: "##-###-####", example: "231234567" },
  "234": { pattern: "###-###-####", example: "8021234567" },
  "254": { pattern: "###-######", example: "712123456" },
  "351": { pattern: "###-###-###", example: "912345678" },
  "353": { pattern: "##-###-####", example: "851234567" },
  "358": { pattern: "##-###-####", example: "401234567" },
  "380": { pattern: "##-###-####", example: "501234567" },
  "420": { pattern: "###-###-###", example: "601123456" },
  "421": { pattern: "###-###-###", example: "912123456" },
  "852": { pattern: "####-####", example: "61234567" },
  "853": { pattern: "####-####", example: "66123456" },
  "880": { pattern: "####-######", example: "1712345678" },
  "886": { pattern: "###-###-###", example: "912345678" },
  "965": { pattern: "####-####", example: "51234567" },
  "966": { pattern: "##-###-####", example: "512345678" },
  "968": { pattern: "####-####", example: "92123456" },
  "971": { pattern: "##-###-####", example: "501234567" },
  "972": { pattern: "##-###-####", example: "501234567" },
  "973": { pattern: "####-####", example: "36001234" },
  "974": { pattern: "####-####", example: "33123456" },
  "977": { pattern: "###-#######", example: "9812345678" },
};

const KNOWN_DIALS: string[] = [
  ...new Set(COUNTRY_CODES.map((c) => c.dial.replace(/\D+/g, "")).filter(Boolean)),
  ...Object.keys(PHONE_FORMATS),
]
  .filter((d, i, all) => all.indexOf(d) === i)
  .sort((a, b) => b.length - a.length);

function onlyDigits(v: string | null | undefined): string {
  return (v || "").replace(/\D+/g, "");
}

function stripLeadingZeros(v: string): string {
  return v.replace(/^0+/, "");
}

function chunkDigits(digits: string, size: number): string {
  const parts: string[] = [];
  let i = 0;
  while (i < digits.length) {
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  return parts.join("-");
}

function chunkGeneric(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${chunkDigits(digits.slice(3), 4)}`;
}

function applyPattern(digits: string, pattern: string): string {
  let out = "";
  let pending = "";
  let i = 0;
  for (const ch of pattern) {
    if (ch !== "#") {
      pending += ch;
      continue;
    }
    if (i >= digits.length) {
      break;
    }
    out += pending + digits[i];
    pending = "";
    i += 1;
  }
  if (i < digits.length) {
    out += `-${chunkDigits(digits.slice(i), 4)}`;
  }
  return out;
}

function formatForDial(dial: string, national: string): string {
  const format = PHONE_FORMATS[dial] || DEFAULT_FORMAT;
  return applyPattern(national, format.pattern);
}

function findDial(digits: string): string | null {
  return KNOWN_DIALS.find((d) => digits.startsWith(d)) ?? null;
}

const PRIMARY_ISO: Record<string, string> = { "1": "US", "7": "RU", "39": "IT" };

const ISO_BY_DIAL: Record<string, string> = buildIsoByDial();

function buildIsoByDial(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const country of COUNTRY_CODES) {
    const dial = country.dial.replace(/\D+/g, "");
    if (dial && !map[dial]) {
      map[dial] = country.iso;
    }
  }
  return { ...map, ...PRIMARY_ISO };
}

function stripTrunkPrefix(national: string): string {
  if (national.startsWith("(0")) {
    const close = national.indexOf(")");
    if (close > 0) {
      return `${national.slice(2, close)}${national.slice(close + 1)}`;
    }
    return national.slice(2);
  }
  if (national.startsWith("0")) {
    return national.slice(1);
  }
  return national;
}

function stripNationalPrefix(iso: string, digits: string): string {
  if (!digits.startsWith("0")) {
    return digits;
  }
  const parser = new AsYouType(iso as CountryCode);
  parser.input(digits);
  const national = parser.getNationalNumber();
  if (!national || national.length >= digits.length) {
    return digits;
  }
  return national;
}

function formatKnownNumber(e164: string): string | null {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed || !parsed.isValid()) {
    return null;
  }
  const formatted = parsed.formatNational();
  let national = formatted.trim();
  if (onlyDigits(formatted) !== parsed.nationalNumber) {
    national = stripTrunkPrefix(formatted).trim();
  }
  if (!national || !/[ ()-]/.test(national)) {
    return null;
  }
  return `+${parsed.countryCallingCode} ${national}`;
}

export function formatPhone(
  normalized: string | null | undefined,
  rawFallback?: string | null,
): string | null {
  const normDigits = onlyDigits(normalized);

  if (normDigits) {
    const known = formatKnownNumber(`+${normDigits}`);
    if (known) {
      return known;
    }
    const dial = findDial(normDigits);
    if (dial) {
      const national = stripLeadingZeros(normDigits.slice(dial.length));
      if (!national) {
        return `+${dial}`;
      }
      return `+${dial} ${formatForDial(dial, national)}`;
    }
    return `+${chunkGeneric(normDigits)}`;
  }

  const rawDigits = stripLeadingZeros(onlyDigits(rawFallback));
  if (!rawDigits) {
    return null;
  }
  return chunkGeneric(rawDigits);
}

export function formatPhoneParts(
  countryCode: string | null | undefined,
  phoneNumber: string | null | undefined,
): string | null {
  let national = stripLeadingZeros(onlyDigits(phoneNumber));
  if (!national) {
    return null;
  }
  const dial = onlyDigits(countryCode);
  if (!dial) {
    return chunkGeneric(national);
  }
  if (national.startsWith(dial)) {
    const withoutDial = national.slice(dial.length);
    if (withoutDial.length >= MIN_NATIONAL_DIGITS) {
      national = withoutDial;
    }
  }
  const known = formatKnownNumber(`+${dial}${national}`);
  if (known) {
    return known;
  }
  return `+${dial} ${formatForDial(dial, national)}`;
}

function hasSeparator(value: string): boolean {
  return /[ ()-]/.test(value);
}

function isUsableNationalFormat(formatted: string, digits: string, dial: string): boolean {
  if (!hasSeparator(formatted) || onlyDigits(formatted) !== digits) {
    return false;
  }
  return !formatted.startsWith(`${dial} `);
}

function formatWithNumberingPlan(iso: string, dial: string, digits: string): string | null {
  const direct = new AsYouType(iso as CountryCode).input(digits);
  if (isUsableNationalFormat(direct, digits, dial)) {
    return direct;
  }
  const trunked = stripTrunkPrefix(new AsYouType(iso as CountryCode).input(`0${digits}`)).trim();
  if (isUsableNationalFormat(trunked, digits, dial)) {
    return trunked;
  }
  return null;
}

export function formatNationalPhone(
  countryCode: string | null | undefined,
  value: string | null | undefined,
): string {
  const digits = onlyDigits(value).slice(0, MAX_NATIONAL_DIGITS);
  if (!digits) {
    return "";
  }
  const dial = onlyDigits(countryCode);
  const iso = ISO_BY_DIAL[dial];
  if (iso) {
    const national = stripNationalPrefix(iso, digits);
    const planned = formatWithNumberingPlan(iso, dial, national);
    if (planned) {
      return planned;
    }
    return formatForDial(dial, national);
  }
  return formatForDial(dial, digits);
}

function caretAfterDigits(formatted: string, digits: number): number {
  if (digits <= 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (!/\d/.test(formatted[i])) {
      continue;
    }
    seen += 1;
    if (seen === digits) {
      return i + 1;
    }
  }
  return formatted.length;
}

export function formatPhoneInput(params: {
  countryCode?: string | null;
  raw: string;
  caret: number;
  previous: string;
}): { value: string; caret: number } {
  const { countryCode, raw, caret, previous } = params;
  const headDigits = onlyDigits(raw.slice(0, caret));
  const tailDigits = onlyDigits(raw.slice(caret));
  let head = headDigits;
  const removedOnlySeparators =
    raw.length < previous.length &&
    headDigits.length + tailDigits.length === onlyDigits(previous).length;
  if (removedOnlySeparators) {
    head = headDigits.slice(0, -1);
  }
  let digits = `${head}${tailDigits}`.slice(0, MAX_NATIONAL_DIGITS);
  const dial = onlyDigits(countryCode);
  if (raw.trim().startsWith("+") && dial && digits.startsWith(dial)) {
    const withoutDial = digits.slice(dial.length);
    if (withoutDial.length >= MIN_NATIONAL_DIGITS) {
      digits = withoutDial;
      if (head.length > dial.length) {
        head = head.slice(dial.length);
      } else {
        head = "";
      }
    }
  }
  const value = formatNationalPhone(countryCode, digits);
  return { value, caret: caretAfterDigits(value, Math.min(head.length, digits.length)) };
}

export function formatEnteredPhone(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) {
    return null;
  }
  if (!raw.startsWith("+")) {
    return raw;
  }
  const known = formatKnownNumber(raw);
  if (known) {
    return known;
  }
  if (/[a-z]/i.test(raw)) {
    return raw;
  }
  return formatPhone(raw) ?? raw;
}

export function phonePlaceholder(countryCode?: string | null): string {
  const dial = onlyDigits(countryCode);
  const format = PHONE_FORMATS[dial] || DEFAULT_FORMAT;
  return applyPattern(format.example, format.pattern);
}
