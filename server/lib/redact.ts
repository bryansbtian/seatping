export function maskEmail(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "[none]";
  }
  const at = raw.lastIndexOf("@");
  if (at <= 0) {
    return "[redacted]";
  }
  const domain = raw.slice(at + 1);
  if (!domain) {
    return "[redacted]";
  }
  return `${raw.slice(0, 1)}***@${domain}`;
}

export function maskEmailList(values: readonly string[]): string {
  if (values.length === 0) {
    return "";
  }
  return values.map((value) => maskEmail(value)).join(", ");
}

export function maskPhone(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "[none]";
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) {
    return "[redacted]";
  }
  let prefix = "";
  if (raw.startsWith("+")) {
    prefix = "+";
  }
  return `${prefix}${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
