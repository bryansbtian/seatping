export type EtaConfidence = "low" | "medium" | "high";

export type QueueEta = {
  position: number;
  peopleAhead: number;
  estimatedWaitMin: number;
  estimatedWaitMax: number;
  displayText: string;
  confidence: EtaConfidence;
  basis: {
    usedRecentServiceRate: boolean;
    usedHistoricalWaitTime: boolean;
    usedReservationPressure: boolean;
    weightedQueueAhead: number;
    blendedMinutesPerParty: number;
    reservationPressureMultiplier: number;
  };
};

const ACTIVE_RESERVATION_STATUSES = ["confirmed", "arrived"];
const DEFAULT_MINUTES_PER_PARTY = 5;
const MIN_MINUTES_PER_PARTY = 3;
const MAX_MINUTES_PER_PARTY = 30;
const DISPLAY_CAP_MIN = 60;

export function partyWeight(partySize: any): number {
  const n = Number(partySize);
  let size: number;
  if (Number.isFinite(n) && n > 0) {
    size = n;
  } else {
    size = 2;
  }
  return 1 + Math.max(0, size - 2) * 0.15;
}

function partySizeOf(c: any): number {
  const n = Number(c?.partySize ?? c?.numGuests);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  return 2;
}

function validDate(v: any): Date | null {
  if (!v) {
    return null;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

function recentMinutesPerParty(admitted: any[], now: Date): number | null {
  const count = (windowMin: number) =>
    admitted.filter((c) => {
      if (c?.finalStatus === "no_show") {
        return false;
      }
      const a = validDate(c?.admittedAt);
      if (!a) {
        return false;
      }
      const ageMin = (now.getTime() - a.getTime()) / 60000;
      return ageMin >= 0 && ageMin <= windowMin;
    }).length;

  const last30 = count(30);
  if (last30 >= 2) {
    return 30 / last30;
  }
  const last60 = count(60);
  if (last60 >= 2) {
    return 60 / last60;
  }
  return null;
}

function historicalMinutesPerParty(
  admitted: any[],
  now: Date,
): { value: number; hadData: boolean } {
  type Sample = { wait: number; dow: number; hour: number };
  const samples: Sample[] = [];
  for (const c of admitted) {
    if (c?.finalStatus === "no_show") {
      continue;
    }
    const join = validDate(c?.joinedAt);
    const admit = validDate(c?.admittedAt);
    if (!join || !admit) {
      continue;
    }
    const wait = Math.max(0, (admit.getTime() - join.getTime()) / 60000);
    samples.push({ wait, dow: admit.getDay(), hour: admit.getHours() });
  }
  if (samples.length === 0) {
    return { value: DEFAULT_MINUTES_PER_PARTY, hadData: false };
  }

  const avg = (arr: Sample[]) => arr.reduce((s, x) => s + x.wait, 0) / arr.length;

  const dowHour = samples.filter((s) => s.dow === now.getDay() && s.hour === now.getHours());
  if (dowHour.length) {
    return { value: avg(dowHour), hadData: true };
  }
  const hour = samples.filter((s) => s.hour === now.getHours());
  if (hour.length) {
    return { value: avg(hour), hadData: true };
  }
  return { value: avg(samples), hadData: true };
}

function reservationPressureMultiplier(
  reservations: any[],
  reservationSettings: any,
  reservationsEnabled: boolean,
  now: Date,
): { multiplier: number; used: boolean } {
  const maxPerHour = Number(reservationSettings?.maxReservedGuestsPerHour);
  if (!reservationsEnabled || !Number.isFinite(maxPerHour) || maxPerHour <= 0) {
    return { multiplier: 1, used: false };
  }
  const horizon = now.getTime() + 60 * 60000;
  let reservedGuestsNextHour = 0;
  for (const r of reservations) {
    if (!ACTIVE_RESERVATION_STATUSES.includes(r?.status)) {
      continue;
    }
    const t = validDate(r?.reservationDateTime);
    if (!t) {
      continue;
    }
    if (t.getTime() >= now.getTime() && t.getTime() <= horizon) {
      reservedGuestsNextHour += partySizeOf(r);
    }
  }
  if (reservedGuestsNextHour <= 0) {
    return { multiplier: 1, used: false };
  }
  const pressure = reservedGuestsNextHour / maxPerHour;
  return { multiplier: 1 + Math.min(pressure, 1) * 0.5, used: true };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function toDisplay(etaMinutes: number): {
  min: number;
  max: number;
  text: string;
} {
  if (etaMinutes < 5) {
    return { min: 0, max: 5, text: "Less Than 5 Minutes" };
  }
  const min = Math.floor(etaMinutes / 5) * 5;
  const max = min + 5;
  if (min >= DISPLAY_CAP_MIN) {
    return { min: DISPLAY_CAP_MIN, max: DISPLAY_CAP_MIN, text: "60+ Minutes" };
  }
  return { min, max, text: `${min}-${max} Minutes` };
}

export type ComputeQueueEtaInput = {
  queue: any[];
  admittedCustomers: any[];
  reservations: any[];
  reservationSettings: any;
  reservationsEnabled: boolean;
  ticketIndex: number;
  now?: Date;
};

export function computeQueueEta(input: ComputeQueueEtaInput): QueueEta {
  const now = input.now ?? new Date();
  let queue: any[] = [];
  if (Array.isArray(input.queue)) {
    queue = input.queue;
  }
  let admitted: any[] = [];
  if (Array.isArray(input.admittedCustomers)) {
    admitted = input.admittedCustomers;
  }
  let reservations: any[] = [];
  if (Array.isArray(input.reservations)) {
    reservations = input.reservations;
  }

  const ticketIndex = Math.max(0, input.ticketIndex);
  const peopleAhead = ticketIndex;
  const position = ticketIndex + 1;

  const weightedQueueAhead = queue
    .slice(0, ticketIndex)
    .reduce((sum, c) => sum + partyWeight(partySizeOf(c)), 0);

  const recent = recentMinutesPerParty(admitted, now);
  const historical = historicalMinutesPerParty(admitted, now);
  let blended: number;
  if (recent != null) {
    blended = 0.6 * recent + 0.4 * historical.value;
  } else {
    blended = historical.value;
  }
  blended = clamp(blended, MIN_MINUTES_PER_PARTY, MAX_MINUTES_PER_PARTY);

  const pressure = reservationPressureMultiplier(
    reservations,
    input.reservationSettings,
    input.reservationsEnabled,
    now,
  );

  const etaMinutes = weightedQueueAhead * blended * pressure.multiplier;
  const { min, max, text } = toDisplay(etaMinutes);

  let confidence: EtaConfidence = "low";
  if (recent != null && historical.hadData) {
    confidence = "high";
  } else if (recent != null || historical.hadData) {
    confidence = "medium";
  }

  return {
    position,
    peopleAhead,
    estimatedWaitMin: min,
    estimatedWaitMax: max,
    displayText: text,
    confidence,
    basis: {
      usedRecentServiceRate: recent != null,
      usedHistoricalWaitTime: historical.hadData,
      usedReservationPressure: pressure.used,
      weightedQueueAhead: Math.round(weightedQueueAhead * 100) / 100,
      blendedMinutesPerParty: Math.round(blended * 100) / 100,
      reservationPressureMultiplier: Math.round(pressure.multiplier * 100) / 100,
    },
  };
}

function locationData(location: any) {
  let queue: any[] = [];
  if (Array.isArray(location?.queue)) {
    queue = location.queue;
  }
  let admittedCustomers: any[] = [];
  if (Array.isArray(location?.admittedCustomers)) {
    admittedCustomers = location.admittedCustomers;
  }
  let reservations: any[] = [];
  if (Array.isArray(location?.reservations)) {
    reservations = location.reservations;
  }
  return {
    queue,
    admittedCustomers,
    reservations,
    reservationSettings: location?.reservationSettings ?? {},
    reservationsEnabled: location?.reservationsEnabled ?? true,
  };
}

export function etaForToken(location: any, queueToken: string, now?: Date): QueueEta | null {
  const data = locationData(location);
  const ticketIndex = data.queue.findIndex((c: any) => c?.queueToken === queueToken);
  if (ticketIndex === -1) {
    return null;
  }
  return computeQueueEta({ ...data, ticketIndex, now });
}

export function etaForAllQueueCustomers(
  location: any,
  now?: Date,
): Array<{ queueToken: string | null } & QueueEta> {
  const data = locationData(location);
  return data.queue.map((c: any, i: number) => ({
    queueToken: c?.queueToken ?? null,
    ...computeQueueEta({ ...data, ticketIndex: i, now }),
  }));
}
