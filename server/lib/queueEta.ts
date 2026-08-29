import { getLocationTimezone, zonedWeekdayHour } from "./operatingHours.js";
import {
  ACTIVE_STATUSES,
  normalizeSettings,
  splitDateTime,
  zonedWallTimeToMs,
  type ReservationSettings,
} from "./reservations.js";
import { fitsTable } from "./smartAssign.js";

export type EtaConfidence = "low" | "medium" | "high";

export type EtaStatus = "ETA" | "NO_CAPACITY";

export type EtaReason =
  | "TABLE_CONSTRAINED"
  | "THROUGHPUT_CONSTRAINED"
  | "NO_FLOOR_DATA"
  | "TABLES_UNAVAILABLE"
  | "PARTY_EXCEEDS_SEATING";

export type HistoricalCohort = "DOW_HOUR" | "HOUR" | "RECENT" | "ALL" | "NONE";

export type EtaBasis = {
  usedRecentServiceRate: boolean;
  usedHistoricalCadence: boolean;
  usedReservationPressure: boolean;
  usedTableInventory: boolean;
  usedTableCombination: boolean;
  hasFloorPlan: boolean;
  weightedQueueAhead: number;
  reservationWeightAhead: number;
  recentMinutesPerParty: number | null;
  recentSampleCount: number;
  historicalMinutesPerParty: number | null;
  historicalSampleCount: number;
  historicalCohort: HistoricalCohort;
  blendedMinutesPerParty: number;
  recentWeight: number;
  partiesAheadOfTable: number;
  reservationsHeld: number;
  tableWaitMinutes: number | null;
  turnMinutes: number;
  turnSampleCount: number;
  usedDefaultTurnMinutes: boolean;
};

export type QueueEta = {
  status: EtaStatus;
  position: number;
  peopleAhead: number;
  etaMinutes: number | null;
  estimatedWaitMin: number | null;
  estimatedWaitMax: number | null;
  displayText: string;
  confidence: EtaConfidence;
  reason: EtaReason;
  tableEtaMinutes: number | null;
  throughputEtaMinutes: number;
  basis: EtaBasis;
};

export type EtaTable = {
  id: string;
  roomId?: string | null;
  capacity: number;
  minimumPartySize?: number;
  isBlocked?: boolean;
  cleaningSince?: string | Date | null;
};

export type EtaOccupancy = {
  tableIds: string[];
  start: string | Date | null;
  end: string | Date | null;
  queueEntryId?: string | null;
  reservationId?: string | null;
};

export type EtaCombination = {
  id: string;
  tableIds: string[];
  minimumPartySize?: number;
};

export type TurnSample = { seatedAt: Date | null; completedAt: Date | null };

const DEFAULT_MINUTES_PER_PARTY = 5;
const MIN_MINUTES_PER_PARTY = 3;
const MAX_MINUTES_PER_PARTY = 30;
const DISPLAY_BUCKET_MINUTES = 5;
const DISPLAY_CAP_MINUTES = 60;
const DEFAULT_PARTY_SIZE = 2;
const NO_CAPACITY_DISPLAY_TEXT = "No Table Fits This Party";

export const MAX_SERVICE_GAP_MINUTES = 45;
export const RECENT_WINDOWS_MINUTES = [60, 120];
export const MIN_RECENT_DELTAS = 2;
export const MIN_HISTORICAL_DELTAS = 3;
export const HISTORICAL_RECENT_DAYS = 14;
export const RECENT_WEIGHT_TARGET_SAMPLES = 4;
export const RECENT_WEIGHT_CAP = 0.75;
export const TRIMMED_MEAN_MIN_SAMPLES = 5;
export const TRIM_FRACTION = 0.2;
export const AGREEMENT_FACTOR = 1.5;
export const ETA_DIVERGENCE_FACTOR = 2;
export const DIVERGENCE_FLOOR_MINUTES = 5;

export const DEFAULT_TURN_MINUTES = 90;
export const MIN_TURN_MINUTES = 30;
export const MAX_TURN_MINUTES = 180;
export const MIN_TURN_SAMPLE_MINUTES = 5;
export const MAX_TURN_SAMPLE_MINUTES = 480;
export const MIN_TURN_SAMPLES = 3;
export const STRONG_TURN_SAMPLES = 10;

export const CLEANING_MINUTES = 5;
export const RESERVATION_HORIZON_MINUTES = 180;
export const MAX_COMBINATION_TABLES = 6;
export const MAX_COMBINATION_CANDIDATES = 60;
export const COMBINATION_SEARCH_BUDGET = 5000;

const WALL_CLOCK_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function trimmedMean(values: number[], trimFraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * trimFraction);
  let kept = sorted.slice(cut, sorted.length - cut);
  if (kept.length === 0) {
    kept = sorted;
  }
  return kept.reduce((total, value) => total + value, 0) / kept.length;
}

export function robustCenter(values: number[]): number {
  if (values.length < TRIMMED_MEAN_MIN_SAMPLES) {
    return median(values);
  }
  return trimmedMean(values, TRIM_FRACTION);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function partyWeight(partySize: any): number {
  const parsed = Number(partySize);
  let size: number;
  if (Number.isFinite(parsed) && parsed > 0) {
    size = parsed;
  } else {
    size = DEFAULT_PARTY_SIZE;
  }
  return 1 + Math.max(0, size - DEFAULT_PARTY_SIZE) * 0.15;
}

function partySizeOf(candidate: any): number {
  const parsed = Number(candidate?.partySize ?? candidate?.numGuests ?? candidate?.guestCount);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_PARTY_SIZE;
}

function validDate(value: any): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function resolveReservationStartMs(value: any, timezone?: string): number | null {
  if (typeof value === "string" && WALL_CLOCK_RE.test(value)) {
    const { date, time } = splitDateTime(value);
    const ms = zonedWallTimeToMs(date, time, timezone);
    if (Number.isFinite(ms)) {
      return ms;
    }
    return null;
  }
  const parsed = validDate(value);
  if (!parsed) {
    return null;
  }
  return parsed.getTime();
}

export function turnSampleMinutes(samples: TurnSample[]): number[] {
  const durations: number[] = [];
  for (const sample of samples) {
    if (!sample?.seatedAt || !sample?.completedAt) {
      continue;
    }
    const seated = validDate(sample.seatedAt);
    const completed = validDate(sample.completedAt);
    if (!seated || !completed) {
      continue;
    }
    const minutes = (completed.getTime() - seated.getTime()) / 60000;
    if (minutes < MIN_TURN_SAMPLE_MINUTES || minutes > MAX_TURN_SAMPLE_MINUTES) {
      continue;
    }
    durations.push(minutes);
  }
  return durations;
}

export function estimateTurnMinutes(samples: TurnSample[]): {
  minutes: number;
  sampleCount: number;
  usedDefault: boolean;
} {
  const durations = turnSampleMinutes(samples);
  if (durations.length < MIN_TURN_SAMPLES) {
    return { minutes: DEFAULT_TURN_MINUTES, sampleCount: durations.length, usedDefault: true };
  }
  const center = robustCenter(durations);
  const minutes = Math.round(clamp(center, MIN_TURN_MINUTES, MAX_TURN_MINUTES));
  return { minutes, sampleCount: durations.length, usedDefault: false };
}

function admissionTimes(admitted: any[]): number[] {
  const times: number[] = [];
  for (const customer of admitted) {
    if (customer?.finalStatus === "no_show") {
      continue;
    }
    const at = validDate(customer?.admittedAt);
    if (!at) {
      continue;
    }
    times.push(at.getTime());
  }
  times.sort((a, b) => a - b);
  return times;
}

function admissionDeltas(times: number[]): number[] {
  const deltas: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const minutes = (times[index] - times[index - 1]) / 60000;
    if (minutes <= 0) {
      continue;
    }
    if (minutes > MAX_SERVICE_GAP_MINUTES) {
      continue;
    }
    deltas.push(minutes);
  }
  return deltas;
}

export type ThroughputEstimate = {
  value: number | null;
  sampleCount: number;
};

export function recentMinutesPerParty(admitted: any[], now: Date): ThroughputEstimate {
  const nowMs = now.getTime();
  const times = admissionTimes(admitted);

  for (const windowMinutes of RECENT_WINDOWS_MINUTES) {
    const from = nowMs - windowMinutes * 60000;
    const inWindow = times.filter((time) => time >= from && time <= nowMs);
    const deltas = admissionDeltas(inWindow);
    if (inWindow.length > 0) {
      const sinceLast = (nowMs - inWindow[inWindow.length - 1]) / 60000;
      if (sinceLast > 0 && sinceLast <= MAX_SERVICE_GAP_MINUTES) {
        deltas.push(sinceLast);
      }
    }
    if (deltas.length >= MIN_RECENT_DELTAS) {
      return { value: robustCenter(deltas), sampleCount: deltas.length };
    }
  }

  return { value: null, sampleCount: 0 };
}

type HistoricalDelta = {
  minutes: number;
  at: number;
  weekday: number;
  hour: number;
};

export type HistoricalEstimate = ThroughputEstimate & { cohort: HistoricalCohort };

export function historicalMinutesPerParty(
  admitted: any[],
  now: Date,
  timezone?: string,
): HistoricalEstimate {
  const times = admissionTimes(admitted);
  const deltas: HistoricalDelta[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const minutes = (times[index] - times[index - 1]) / 60000;
    if (minutes <= 0 || minutes > MAX_SERVICE_GAP_MINUTES) {
      continue;
    }
    const at = times[index];
    const parts = zonedWeekdayHour(new Date(at), timezone);
    deltas.push({ minutes, at, weekday: parts.weekday, hour: parts.hour });
  }

  if (deltas.length === 0) {
    return { value: null, sampleCount: 0, cohort: "NONE" };
  }

  const nowParts = zonedWeekdayHour(now, timezone);
  const recentFrom = now.getTime() - HISTORICAL_RECENT_DAYS * 24 * 60 * 60000;

  const cohorts: Array<{ name: HistoricalCohort; samples: HistoricalDelta[]; minimum: number }> = [
    {
      name: "DOW_HOUR",
      samples: deltas.filter(
        (delta) => delta.weekday === nowParts.weekday && delta.hour === nowParts.hour,
      ),
      minimum: MIN_HISTORICAL_DELTAS,
    },
    {
      name: "HOUR",
      samples: deltas.filter((delta) => delta.hour === nowParts.hour),
      minimum: MIN_HISTORICAL_DELTAS,
    },
    {
      name: "RECENT",
      samples: deltas.filter((delta) => delta.at >= recentFrom),
      minimum: MIN_HISTORICAL_DELTAS,
    },
    { name: "ALL", samples: deltas, minimum: 1 },
  ];

  for (const cohort of cohorts) {
    if (cohort.samples.length >= cohort.minimum) {
      const values = cohort.samples.map((sample) => sample.minutes);
      return {
        value: robustCenter(values),
        sampleCount: values.length,
        cohort: cohort.name,
      };
    }
  }

  return { value: null, sampleCount: 0, cohort: "NONE" };
}

export function blendMinutesPerParty(
  recent: ThroughputEstimate,
  historical: ThroughputEstimate,
): { value: number; weight: number } {
  if (recent.value === null && historical.value === null) {
    return { value: DEFAULT_MINUTES_PER_PARTY, weight: 0 };
  }
  if (recent.value === null) {
    return { value: clampMinutesPerParty(historical.value as number), weight: 0 };
  }
  if (historical.value === null) {
    return { value: clampMinutesPerParty(recent.value), weight: 1 };
  }
  const weight = Math.min(RECENT_WEIGHT_CAP, recent.sampleCount / RECENT_WEIGHT_TARGET_SAMPLES);
  const blended = weight * recent.value + (1 - weight) * historical.value;
  return { value: clampMinutesPerParty(blended), weight };
}

function clampMinutesPerParty(value: number): number {
  return clamp(value, MIN_MINUTES_PER_PARTY, MAX_MINUTES_PER_PARTY);
}

type BusyWindow = { start: number; end: number };

type SimulatedTable = {
  id: string;
  roomId: string;
  capacity: number;
  minimumPartySize: number;
  isBlocked: boolean;
  readyAt: number;
  busy: BusyWindow[];
};

type SimulatedSetup = {
  id: string;
  members: SimulatedTable[];
  capacity: number;
  minimumPartySize: number;
};

type SeatingChoice = { setup: SimulatedSetup; start: number };

export function buildSimulatedTables(
  tables: EtaTable[],
  occupancy: EtaOccupancy[],
  now: Date,
): SimulatedTable[] {
  const nowMs = now.getTime();
  const byId = new Map<string, SimulatedTable>();

  for (const table of tables) {
    if (!table?.id) {
      continue;
    }
    const capacity = Number(table.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      continue;
    }

    let minimumPartySize = Number(table.minimumPartySize);
    if (!Number.isFinite(minimumPartySize) || minimumPartySize < 1) {
      minimumPartySize = 1;
    }

    let readyAt = nowMs;
    const cleaningSince = validDate(table.cleaningSince);
    if (cleaningSince) {
      const elapsed = (nowMs - cleaningSince.getTime()) / 60000;
      readyAt = nowMs + Math.max(0, CLEANING_MINUTES - elapsed) * 60000;
    }

    let roomId = "";
    if (typeof table.roomId === "string" && table.roomId) {
      roomId = table.roomId;
    }

    byId.set(table.id, {
      id: table.id,
      roomId,
      capacity,
      minimumPartySize,
      isBlocked: Boolean(table.isBlocked),
      readyAt,
      busy: [],
    });
  }

  for (const entry of occupancy) {
    const end = validDate(entry?.end);
    if (!end || end.getTime() <= nowMs) {
      continue;
    }
    const start = validDate(entry?.start);
    let from = nowMs;
    if (start && start.getTime() > nowMs) {
      from = start.getTime();
    }
    let tableIds: string[] = [];
    if (Array.isArray(entry?.tableIds)) {
      tableIds = entry.tableIds.filter((id): id is string => Boolean(id));
    }
    for (const tableId of tableIds) {
      const table = byId.get(tableId);
      if (!table) {
        continue;
      }
      table.busy.push({ start: from, end: end.getTime() });
    }
  }

  const simulated = [...byId.values()];
  for (const table of simulated) {
    table.busy.sort((a, b) => a.start - b.start);
  }
  simulated.sort((a, b) => a.id.localeCompare(b.id));
  return simulated;
}

function setupFromMembers(members: SimulatedTable[]): SimulatedSetup {
  const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const capacity = ordered.reduce((total, member) => total + member.capacity, 0);
  const minimumPartySize = ordered.reduce(
    (highest, member) => Math.max(highest, member.minimumPartySize),
    1,
  );
  return {
    id: ordered.map((member) => member.id).join("+"),
    members: ordered,
    capacity,
    minimumPartySize,
  };
}

export function earliestSetupStart(
  setup: SimulatedSetup,
  durationMs: number,
  fromMs: number,
): number {
  let readyAt = fromMs;
  for (const member of setup.members) {
    if (member.isBlocked) {
      return Number.POSITIVE_INFINITY;
    }
    if (member.readyAt > readyAt) {
      readyAt = member.readyAt;
    }
  }

  const busy: BusyWindow[] = [];
  for (const member of setup.members) {
    busy.push(...member.busy);
  }
  busy.sort((a, b) => a.start - b.start);

  let start = Math.max(fromMs, readyAt);
  for (const window of busy) {
    if (window.end <= start) {
      continue;
    }
    if (start + durationMs <= window.start) {
      break;
    }
    start = window.end;
  }
  return start;
}

function fitsSetup(partySize: number, setup: SimulatedSetup): boolean {
  return fitsTable(partySize, {
    capacity: setup.capacity,
    minimumPartySize: setup.minimumPartySize,
  });
}

function configuredSetups(
  combinations: EtaCombination[],
  byId: Map<string, SimulatedTable>,
  partySize: number,
): SimulatedSetup[] {
  const setups: SimulatedSetup[] = [];
  for (const combination of combinations) {
    let tableIds: string[] = [];
    if (Array.isArray(combination?.tableIds)) {
      tableIds = combination.tableIds.filter((id): id is string => Boolean(id));
    }
    if (tableIds.length < 2 || tableIds.length > MAX_COMBINATION_TABLES) {
      continue;
    }
    const members: SimulatedTable[] = [];
    for (const tableId of tableIds) {
      const member = byId.get(tableId);
      if (member) {
        members.push(member);
      }
    }
    if (members.length !== tableIds.length) {
      continue;
    }
    const setup = setupFromMembers(members);
    const configuredMinimum = Number(combination.minimumPartySize);
    if (Number.isFinite(configuredMinimum) && configuredMinimum > setup.minimumPartySize) {
      setup.minimumPartySize = configuredMinimum;
    }
    if (!fitsSetup(partySize, setup)) {
      continue;
    }
    setups.push(setup);
  }
  setups.sort((a, b) => a.id.localeCompare(b.id));
  return setups;
}

export function deriveCombinationSetups(
  tables: SimulatedTable[],
  partySize: number,
): SimulatedSetup[] {
  const rooms = new Map<string, SimulatedTable[]>();
  for (const table of tables) {
    if (table.minimumPartySize > partySize) {
      continue;
    }
    const bucket = rooms.get(table.roomId) ?? [];
    bucket.push(table);
    rooms.set(table.roomId, bucket);
  }

  const results: SimulatedSetup[] = [];
  let budget = COMBINATION_SEARCH_BUDGET;

  const roomIds = [...rooms.keys()].sort((a, b) => a.localeCompare(b));
  for (const roomId of roomIds) {
    const members = [...(rooms.get(roomId) ?? [])].sort((a, b) => {
      if (a.capacity !== b.capacity) {
        return b.capacity - a.capacity;
      }
      return a.id.localeCompare(b.id);
    });

    const search = (from: number, chosen: SimulatedTable[], capacity: number): void => {
      for (let index = from; index < members.length; index += 1) {
        if (results.length >= MAX_COMBINATION_CANDIDATES || budget <= 0) {
          return;
        }
        budget -= 1;
        const member = members[index];
        const nextChosen = [...chosen, member];
        const nextCapacity = capacity + member.capacity;
        if (nextCapacity >= partySize) {
          if (nextChosen.length >= 2) {
            results.push(setupFromMembers(nextChosen));
          }
          continue;
        }
        if (nextChosen.length < MAX_COMBINATION_TABLES) {
          search(index + 1, nextChosen, nextCapacity);
        }
      }
    };

    search(0, [], 0);
  }

  return results;
}

export function setupsForParty(
  tables: SimulatedTable[],
  combinations: EtaCombination[],
  partySize: number,
): { setups: SimulatedSetup[]; combined: boolean } {
  const singles: SimulatedSetup[] = [];
  const byId = new Map<string, SimulatedTable>();
  for (const table of tables) {
    byId.set(table.id, table);
    if (fitsTable(partySize, table)) {
      singles.push(setupFromMembers([table]));
    }
  }
  if (singles.length > 0) {
    return { setups: singles, combined: false };
  }

  const configured = configuredSetups(combinations, byId, partySize);
  if (configured.length > 0) {
    return { setups: configured, combined: true };
  }

  return { setups: deriveCombinationSetups(tables, partySize), combined: true };
}

export function canEverSeat(
  tables: SimulatedTable[],
  combinations: EtaCombination[],
  partySize: number,
): boolean {
  const eligible = tables.filter((table) => table.minimumPartySize <= partySize);
  if (eligible.some((table) => table.capacity >= partySize)) {
    return true;
  }

  const byId = new Map(tables.map((table) => [table.id, table]));
  if (configuredSetups(combinations, byId, partySize).length > 0) {
    return true;
  }

  const rooms = new Map<string, number[]>();
  for (const table of eligible) {
    const bucket = rooms.get(table.roomId) ?? [];
    bucket.push(table.capacity);
    rooms.set(table.roomId, bucket);
  }
  for (const capacities of rooms.values()) {
    const best = capacities.sort((a, b) => b - a).slice(0, MAX_COMBINATION_TABLES);
    const total = best.reduce((sum, capacity) => sum + capacity, 0);
    if (total >= partySize) {
      return true;
    }
  }
  return false;
}

function pickSeating(
  tables: SimulatedTable[],
  combinations: EtaCombination[],
  partySize: number,
  fromMs: number,
  durationMs: number,
): SeatingChoice | null {
  const { setups } = setupsForParty(tables, combinations, partySize);
  let best: SeatingChoice | null = null;

  for (const setup of setups) {
    const start = earliestSetupStart(setup, durationMs, fromMs);
    if (!Number.isFinite(start)) {
      continue;
    }
    if (!best) {
      best = { setup, start };
      continue;
    }
    if (start < best.start) {
      best = { setup, start };
      continue;
    }
    if (start > best.start) {
      continue;
    }
    if (setup.members.length !== best.setup.members.length) {
      if (setup.members.length < best.setup.members.length) {
        best = { setup, start };
      }
      continue;
    }
    const waste = setup.capacity - partySize;
    const bestWaste = best.setup.capacity - partySize;
    if (waste !== bestWaste) {
      if (waste < bestWaste) {
        best = { setup, start };
      }
      continue;
    }
    if (setup.id < best.setup.id) {
      best = { setup, start };
    }
  }

  return best;
}

function holdSeating(choice: SeatingChoice, durationMs: number): void {
  for (const member of choice.setup.members) {
    member.busy.push({ start: choice.start, end: choice.start + durationMs });
    member.busy.sort((a, b) => a.start - b.start);
  }
}

export type SeatingForecastStatus = "ETA" | "NO_CAPACITY" | "NO_FLOOR_DATA" | "UNAVAILABLE";

export type SeatingForecast = {
  status: SeatingForecastStatus;
  waitMinutes: number | null;
  usedCombination: boolean;
  reservationsHeld: number;
};

export type SimulateSeatingInput = {
  tables: EtaTable[];
  occupancy: EtaOccupancy[];
  combinations: EtaCombination[];
  reservations: any[];
  reservationsEnabled: boolean;
  reservationSettings: ReservationSettings;
  timezone?: string;
  partySizesAhead: number[];
  partySize: number;
  turnMinutes: number;
  now: Date;
};

export function simulateSeating(input: SimulateSeatingInput): SeatingForecast {
  const tables = buildSimulatedTables(input.tables, input.occupancy, input.now);
  if (tables.length === 0) {
    return {
      status: "NO_FLOOR_DATA",
      waitMinutes: null,
      usedCombination: false,
      reservationsHeld: 0,
    };
  }

  if (!canEverSeat(tables, input.combinations, input.partySize)) {
    return {
      status: "NO_CAPACITY",
      waitMinutes: null,
      usedCombination: false,
      reservationsHeld: 0,
    };
  }

  const nowMs = input.now.getTime();
  const durationMs = clamp(input.turnMinutes, MIN_TURN_MINUTES, MAX_TURN_MINUTES) * 60000;
  const reservationDurationMs = input.reservationSettings.defaultReservationDurationMinutes * 60000;

  let reservationsHeld = 0;
  if (input.reservationsEnabled) {
    const alreadyHeld = new Set(
      input.occupancy
        .map((entry) => entry?.reservationId)
        .filter((id): id is string => Boolean(id)),
    );
    const horizon = nowMs + RESERVATION_HORIZON_MINUTES * 60000;
    const holdFloor = nowMs - input.reservationSettings.reservationHoldMinutes * 60000;
    const upcoming: { at: number; size: number }[] = [];

    for (const reservation of input.reservations) {
      if (!ACTIVE_STATUSES.includes(reservation?.status)) {
        continue;
      }
      if (reservation?.id && alreadyHeld.has(reservation.id)) {
        continue;
      }
      const at = resolveReservationStartMs(reservation?.reservationDateTime, input.timezone);
      if (at === null) {
        continue;
      }
      if (at < holdFloor || at > horizon) {
        continue;
      }
      upcoming.push({ at: Math.max(at, nowMs), size: partySizeOf(reservation) });
    }
    upcoming.sort((a, b) => {
      if (a.at !== b.at) {
        return a.at - b.at;
      }
      return b.size - a.size;
    });

    for (const booking of upcoming) {
      const choice = pickSeating(
        tables,
        input.combinations,
        booking.size,
        booking.at,
        reservationDurationMs,
      );
      if (choice) {
        holdSeating(choice, reservationDurationMs);
        reservationsHeld += 1;
      }
    }
  }

  for (const size of input.partySizesAhead) {
    const choice = pickSeating(tables, input.combinations, size, nowMs, durationMs);
    if (choice) {
      holdSeating(choice, durationMs);
    }
  }

  const mine = pickSeating(tables, input.combinations, input.partySize, nowMs, durationMs);
  if (!mine) {
    return {
      status: "UNAVAILABLE",
      waitMinutes: null,
      usedCombination: false,
      reservationsHeld,
    };
  }

  return {
    status: "ETA",
    waitMinutes: Math.max(0, (mine.start - nowMs) / 60000),
    usedCombination: mine.setup.members.length > 1,
    reservationsHeld,
  };
}

export function toDisplay(etaMinutes: number): {
  min: number;
  max: number;
  text: string;
} {
  let value = etaMinutes;
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    value = Math.round(value);
  }
  if (value < DISPLAY_BUCKET_MINUTES) {
    return { min: 0, max: DISPLAY_BUCKET_MINUTES, text: "Less Than 5 Minutes" };
  }
  const min = Math.floor(value / DISPLAY_BUCKET_MINUTES) * DISPLAY_BUCKET_MINUTES;
  if (min >= DISPLAY_CAP_MINUTES) {
    return { min: DISPLAY_CAP_MINUTES, max: DISPLAY_CAP_MINUTES, text: "60+ Minutes" };
  }
  const max = min + DISPLAY_BUCKET_MINUTES;
  return { min, max, text: `${min}-${max} Minutes` };
}

export type ConfidenceEvidence = {
  recentSampleCount: number;
  historicalCohort: HistoricalCohort;
  turnSampleCount: number;
  hasFloorPlan: boolean;
  tableEtaMinutes: number | null;
  throughputEtaMinutes: number;
  recentMinutesPerParty: number | null;
  historicalMinutesPerParty: number | null;
  reservationsRepresented: boolean;
  usedDefaultTurnMinutes: boolean;
};

export function scoreConfidence(evidence: ConfidenceEvidence): EtaConfidence {
  let score = 0;

  if (evidence.recentSampleCount >= RECENT_WEIGHT_TARGET_SAMPLES) {
    score += 2;
  } else if (evidence.recentSampleCount >= MIN_RECENT_DELTAS) {
    score += 1;
  }

  if (evidence.historicalCohort === "DOW_HOUR" || evidence.historicalCohort === "HOUR") {
    score += 2;
  } else if (evidence.historicalCohort === "RECENT" || evidence.historicalCohort === "ALL") {
    score += 1;
  }

  if (evidence.turnSampleCount >= STRONG_TURN_SAMPLES) {
    score += 2;
  } else if (evidence.turnSampleCount >= MIN_TURN_SAMPLES) {
    score += 1;
  }

  if (evidence.hasFloorPlan && evidence.tableEtaMinutes !== null) {
    score += 2;
  }

  if (evidence.reservationsRepresented) {
    score += 1;
  }

  const recent = evidence.recentMinutesPerParty;
  const historical = evidence.historicalMinutesPerParty;
  if (recent !== null && historical !== null && recent > 0 && historical > 0) {
    const ratio = Math.max(recent, historical) / Math.min(recent, historical);
    if (ratio <= AGREEMENT_FACTOR) {
      score += 1;
    }
  }

  const tableEta = evidence.tableEtaMinutes;
  if (
    tableEta !== null &&
    tableEta >= DIVERGENCE_FLOOR_MINUTES &&
    evidence.throughputEtaMinutes >= DIVERGENCE_FLOOR_MINUTES
  ) {
    const ratio =
      Math.max(tableEta, evidence.throughputEtaMinutes) /
      Math.min(tableEta, evidence.throughputEtaMinutes);
    if (ratio > ETA_DIVERGENCE_FACTOR) {
      score -= 2;
    }
  }

  const noThroughputEvidence =
    evidence.recentMinutesPerParty === null && evidence.historicalMinutesPerParty === null;
  if (noThroughputEvidence) {
    score -= 2;
  }
  if (evidence.usedDefaultTurnMinutes && evidence.tableEtaMinutes !== null) {
    score -= 2;
  }

  let confidence: EtaConfidence = "low";
  if (score >= 7) {
    confidence = "high";
  } else if (score >= 4) {
    confidence = "medium";
  }

  if (noThroughputEvidence) {
    return "low";
  }
  if (!evidence.hasFloorPlan && confidence === "high") {
    return "medium";
  }
  return confidence;
}

export type ComputeQueueEtaInput = {
  queue: any[];
  admittedCustomers: any[];
  reservations: any[];
  reservationSettings: any;
  reservationsEnabled: boolean;
  ticketIndex: number;
  diningTables?: EtaTable[];
  tableOccupancy?: EtaOccupancy[];
  tableCombinations?: EtaCombination[];
  turnMinutes?: number;
  turnSampleCount?: number;
  timezone?: string;
  now?: Date;
};

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

export function computeQueueEta(input: ComputeQueueEtaInput): QueueEta {
  const now = input.now ?? new Date();
  const queue = asArray(input.queue);
  const admitted = asArray(input.admittedCustomers);
  const reservations = asArray(input.reservations);
  const diningTables = asArray(input.diningTables) as EtaTable[];
  const tableOccupancy = asArray(input.tableOccupancy) as EtaOccupancy[];
  const tableCombinations = asArray(input.tableCombinations) as EtaCombination[];
  const reservationSettings = normalizeSettings(input.reservationSettings);

  let turnSampleCount = 0;
  if (Number.isFinite(Number(input.turnSampleCount))) {
    turnSampleCount = Math.max(0, Math.trunc(Number(input.turnSampleCount)));
  }
  let usedDefaultTurnMinutes = true;
  let turnMinutes = DEFAULT_TURN_MINUTES;
  if (Number.isFinite(Number(input.turnMinutes)) && Number(input.turnMinutes) > 0) {
    turnMinutes = clamp(Number(input.turnMinutes), MIN_TURN_MINUTES, MAX_TURN_MINUTES);
    usedDefaultTurnMinutes = turnSampleCount < MIN_TURN_SAMPLES;
  }

  const ticketIndex = Math.max(0, input.ticketIndex);
  const peopleAhead = ticketIndex;
  const position = ticketIndex + 1;
  const partySize = partySizeOf(queue[ticketIndex]);

  const weightedQueueAhead = queue
    .slice(0, ticketIndex)
    .reduce((sum, customer) => sum + partyWeight(partySizeOf(customer)), 0);

  const recent = recentMinutesPerParty(admitted, now);
  const historical = historicalMinutesPerParty(admitted, now, input.timezone);
  const blended = blendMinutesPerParty(recent, historical);

  const heldQueueEntryIds = new Set(
    tableOccupancy.map((entry) => entry?.queueEntryId).filter((id): id is string => Boolean(id)),
  );
  const unseatedAdmitted = admitted
    .filter((customer) => customer?.finalStatus === "pending")
    .filter((customer) => !(customer?.id && heldQueueEntryIds.has(customer.id)))
    .sort((a, b) => {
      const left = validDate(a?.admittedAt) ?? validDate(a?.joinedAt);
      const right = validDate(b?.admittedAt) ?? validDate(b?.joinedAt);
      if (!left || !right) {
        return 0;
      }
      return left.getTime() - right.getTime();
    });

  const partySizesAhead: number[] = [
    ...unseatedAdmitted.map((customer) => partySizeOf(customer)),
    ...queue.slice(0, ticketIndex).map((customer) => partySizeOf(customer)),
  ];

  const forecast = simulateSeating({
    tables: diningTables,
    occupancy: tableOccupancy,
    combinations: tableCombinations,
    reservations,
    reservationsEnabled: input.reservationsEnabled,
    reservationSettings,
    timezone: input.timezone,
    partySizesAhead,
    partySize,
    turnMinutes,
    now,
  });

  const floorAware = forecast.status === "ETA";
  const baselineThroughput = weightedQueueAhead * blended.value;
  const reservationPressure = reservationWorkAhead({
    reservations,
    reservationsEnabled: input.reservationsEnabled,
    floorAware,
    horizonMinutes: baselineThroughput,
    timezone: input.timezone,
    now,
  });
  const throughputEtaMinutes = (weightedQueueAhead + reservationPressure.weight) * blended.value;

  const basis: EtaBasis = {
    usedRecentServiceRate: recent.value !== null,
    usedHistoricalCadence: historical.value !== null,
    usedReservationPressure: reservationPressure.used,
    usedTableInventory: floorAware,
    usedTableCombination: forecast.usedCombination,
    hasFloorPlan: forecast.status !== "NO_FLOOR_DATA",
    weightedQueueAhead: round2(weightedQueueAhead),
    reservationWeightAhead: round2(reservationPressure.weight),
    recentMinutesPerParty: roundOrNull(recent.value),
    recentSampleCount: recent.sampleCount,
    historicalMinutesPerParty: roundOrNull(historical.value),
    historicalSampleCount: historical.sampleCount,
    historicalCohort: historical.cohort,
    blendedMinutesPerParty: round2(blended.value),
    recentWeight: round2(blended.weight),
    partiesAheadOfTable: partySizesAhead.length,
    reservationsHeld: forecast.reservationsHeld,
    tableWaitMinutes: roundOrNull(forecast.waitMinutes),
    turnMinutes,
    turnSampleCount,
    usedDefaultTurnMinutes,
  };

  if (forecast.status === "NO_CAPACITY") {
    return {
      status: "NO_CAPACITY",
      position,
      peopleAhead,
      etaMinutes: null,
      estimatedWaitMin: null,
      estimatedWaitMax: null,
      displayText: NO_CAPACITY_DISPLAY_TEXT,
      confidence: "high",
      reason: "PARTY_EXCEEDS_SEATING",
      tableEtaMinutes: null,
      throughputEtaMinutes: round2(throughputEtaMinutes),
      basis,
    };
  }

  let etaMinutes = throughputEtaMinutes;
  let reason: EtaReason = "THROUGHPUT_CONSTRAINED";
  if (forecast.status === "NO_FLOOR_DATA") {
    reason = "NO_FLOOR_DATA";
  }
  if (forecast.status === "UNAVAILABLE") {
    reason = "TABLES_UNAVAILABLE";
  }
  if (forecast.waitMinutes !== null && forecast.waitMinutes > throughputEtaMinutes) {
    etaMinutes = forecast.waitMinutes;
    reason = "TABLE_CONSTRAINED";
  }

  const display = toDisplay(etaMinutes);
  const confidence = scoreConfidence({
    recentSampleCount: recent.sampleCount,
    historicalCohort: historical.cohort,
    turnSampleCount,
    hasFloorPlan: basis.hasFloorPlan,
    tableEtaMinutes: forecast.waitMinutes,
    throughputEtaMinutes,
    recentMinutesPerParty: recent.value,
    historicalMinutesPerParty: historical.value,
    reservationsRepresented: !input.reservationsEnabled || floorAware,
    usedDefaultTurnMinutes,
  });

  return {
    status: "ETA",
    position,
    peopleAhead,
    etaMinutes: round2(etaMinutes),
    estimatedWaitMin: display.min,
    estimatedWaitMax: display.max,
    displayText: display.text,
    confidence,
    reason,
    tableEtaMinutes: roundOrNull(forecast.waitMinutes),
    throughputEtaMinutes: round2(throughputEtaMinutes),
    basis,
  };
}

function roundOrNull(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return round2(value);
}

function reservationWorkAhead(input: {
  reservations: any[];
  reservationsEnabled: boolean;
  floorAware: boolean;
  horizonMinutes: number;
  timezone?: string;
  now: Date;
}): { weight: number; used: boolean } {
  if (!input.reservationsEnabled || input.floorAware) {
    return { weight: 0, used: false };
  }
  const horizon = clamp(input.horizonMinutes, 0, RESERVATION_HORIZON_MINUTES);
  if (horizon <= 0) {
    return { weight: 0, used: false };
  }

  const nowMs = input.now.getTime();
  const until = nowMs + horizon * 60000;
  let weight = 0;
  for (const reservation of input.reservations) {
    if (!ACTIVE_STATUSES.includes(reservation?.status)) {
      continue;
    }
    const at = resolveReservationStartMs(reservation?.reservationDateTime, input.timezone);
    if (at === null) {
      continue;
    }
    if (at < nowMs || at > until) {
      continue;
    }
    weight += partyWeight(partySizeOf(reservation));
  }

  if (weight <= 0) {
    return { weight: 0, used: false };
  }
  return { weight, used: true };
}

function locationData(location: any) {
  return {
    queue: asArray(location?.queue),
    admittedCustomers: asArray(location?.admittedCustomers),
    reservations: asArray(location?.reservations),
    reservationSettings: location?.reservationSettings ?? {},
    reservationsEnabled: location?.reservationsEnabled ?? true,
    diningTables: asArray(location?.diningTables) as EtaTable[],
    tableOccupancy: asArray(location?.tableOccupancy) as EtaOccupancy[],
    tableCombinations: asArray(location?.tableCombinations) as EtaCombination[],
    turnMinutes: location?.turnMinutes,
    turnSampleCount: location?.turnSampleCount,
    timezone: getLocationTimezone(location),
  };
}

export function etaForToken(location: any, queueToken: string, now?: Date): QueueEta | null {
  const data = locationData(location);
  const ticketIndex = data.queue.findIndex((customer: any) => customer?.queueToken === queueToken);
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
  return data.queue.map((customer: any, index: number) => ({
    queueToken: customer?.queueToken ?? null,
    ...computeQueueEta({ ...data, ticketIndex: index, now }),
  }));
}
