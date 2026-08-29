export function compactNumber(value: number): string {
  const abs = Math.abs(value);

  if (abs < 1000) {
    return String(value);
  }

  let divisor = 1000;
  let suffix = "k";
  if (abs >= 1_000_000_000) {
    divisor = 1_000_000_000;
    suffix = "b";
  } else if (abs >= 1_000_000) {
    divisor = 1_000_000;
    suffix = "m";
  }

  const scaled = value / divisor;
  let text = scaled.toFixed(1);
  if (text.endsWith(".0")) {
    text = text.slice(0, -2);
  }
  return `${text}${suffix}`;
}
