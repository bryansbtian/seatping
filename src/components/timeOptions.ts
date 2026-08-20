export function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  let period: string;
  if (h >= 12) {
    period = "PM";
  } else {
    period = "AM";
  }
  let hour12: number;
  if (h % 12 === 0) {
    hour12 = 12;
  } else {
    hour12 = h % 12;
  }
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function buildTimeOptions(startHour = 0, endHour = 23, stepMin = 30) {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export const ALL_DAY_TIME_OPTIONS = buildTimeOptions(0, 23, 30);
