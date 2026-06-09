export const DEFAULT_LOCATION_TIMEZONE = "Asia/Jakarta";
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
function timeToMinutes(time) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}
function dayIndexForDate(date) {
    if (!DATE_RE.test(date))
        return null;
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
function previousDayIndex(dayIndex) {
    return (dayIndex + 6) % 7;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizedDay(openingHours, key) {
    if (!isRecord(openingHours))
        return null;
    const raw = openingHours[key];
    if (!isRecord(raw))
        return null;
    if (raw.enabled === false) {
        return {
            configured: true,
            enabled: false,
            openMin: 0,
            closeMin: 0,
            open: "",
            close: "",
        };
    }
    const open = String(raw.open || "");
    const close = String(raw.close || "");
    if (!TIME_RE.test(open) || !TIME_RE.test(close))
        return null;
    return {
        configured: true,
        enabled: true,
        openMin: timeToMinutes(open),
        closeMin: timeToMinutes(close),
        open,
        close,
    };
}
export function formatOperatingTime(time) {
    if (!TIME_RE.test(time))
        return time;
    const [hourText, minute] = time.split(":");
    const hour24 = Number(hourText);
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
}
function datePartsInTimezone(at, timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(at);
    const values = {};
    for (const part of parts) {
        if (part.type !== "literal")
            values[part.type] = part.value;
    }
    const hour = values.hour === "24" ? 0 : Number(values.hour);
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        minute: hour * 60 + Number(values.minute),
    };
}
export function getOpeningHoursTimezone(openingHours) {
    const timezone = isRecord(openingHours) ? openingHours.timezone : undefined;
    if (typeof timezone !== "string" || !timezone.trim()) {
        return DEFAULT_LOCATION_TIMEZONE;
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
        return timezone;
    }
    catch {
        return DEFAULT_LOCATION_TIMEZONE;
    }
}
export function getLocationOpeningHours(location) {
    if (!isRecord(location) || !isRecord(location.restaurantProfile)) {
        return undefined;
    }
    const openingHours = location.restaurantProfile.openingHours;
    return isRecord(openingHours) ? openingHours : undefined;
}
export function getLocationTimezone(location) {
    return getOpeningHoursTimezone(getLocationOpeningHours(location));
}
/**
 * The current local wall-clock in a timezone as "YYYY-MM-DDTHH:MM". Reservation
 * datetimes are stored in this same naive-local-wall-clock frame, so comparing
 * the two strings answers "has this reservation time already passed for the
 * location right now?" without any timezone-offset math.
 */
export function getNowWallClockInTimezone(timezone) {
    let parts;
    try {
        parts = datePartsInTimezone(new Date(), timezone);
    }
    catch {
        parts = datePartsInTimezone(new Date(), DEFAULT_LOCATION_TIMEZONE);
    }
    const hh = String(Math.floor(parts.minute / 60)).padStart(2, "0");
    const mm = String(parts.minute % 60).padStart(2, "0");
    return `${parts.date}T${hh}:${mm}`;
}
/**
 * Return the operating windows that fall on a restaurant-local calendar date.
 * A previous day's overnight shift contributes its after-midnight portion.
 */
export function getDateOperatingStatus(openingHours, date) {
    const dayIndex = dayIndexForDate(date);
    if (dayIndex === null ||
        !openingHours ||
        typeof openingHours !== "object") {
        return {
            configured: false,
            date,
            dayKey: null,
            dayName: null,
            windows: [],
            isClosed: false,
            hoursLabel: null,
        };
    }
    const dayKey = DAY_KEYS[dayIndex];
    const previousKey = DAY_KEYS[previousDayIndex(dayIndex)];
    const current = normalizedDay(openingHours, dayKey);
    const previous = normalizedDay(openingHours, previousKey);
    const windows = [];
    // Previous-day overnight spill, e.g. Monday 18:00-02:00 contributes
    // Tuesday 00:00-02:00.
    if (previous?.enabled &&
        previous.closeMin <= previous.openMin &&
        previous.closeMin > 0) {
        windows.push({
            openMin: 0,
            closeMin: previous.closeMin,
            sourceDay: previousKey,
        });
    }
    if (current?.enabled) {
        if (current.openMin === current.closeMin) {
            // Matching times follow the existing SeatPing behavior: open 24 hours.
            windows.push({ openMin: 0, closeMin: 1440, sourceDay: dayKey });
        }
        else if (current.closeMin < current.openMin) {
            windows.push({
                openMin: current.openMin,
                closeMin: 1440,
                sourceDay: dayKey,
            });
        }
        else {
            windows.push({
                openMin: current.openMin,
                closeMin: current.closeMin,
                sourceDay: dayKey,
            });
        }
    }
    const configured = Boolean(current || windows.length);
    const hoursLabels = [];
    if (previous?.enabled &&
        previous.closeMin <= previous.openMin &&
        previous.closeMin > 0) {
        hoursLabels.push(`${formatOperatingTime("00:00")} - ${formatOperatingTime(previous.close)}`);
    }
    if (current?.enabled) {
        if (current.open === "00:00" && current.close === "00:00") {
            hoursLabels.push("Open 24 Hours");
        }
        else {
            hoursLabels.push(`${formatOperatingTime(current.open)} - ${formatOperatingTime(current.close)}`);
        }
    }
    const hoursLabel = hoursLabels.length > 0 ? hoursLabels.join(", ") : current ? "Closed" : null;
    return {
        configured,
        date,
        dayKey,
        dayName: dayKey.charAt(0).toUpperCase() + dayKey.slice(1),
        windows,
        isClosed: configured && windows.length === 0,
        hoursLabel,
    };
}
export function isMinuteWithinOperatingHours(status, minute) {
    if (!status.configured)
        return true;
    return status.windows.some((window) => minute >= window.openMin && minute < window.closeMin);
}
export function getCurrentOperatingStatus(openingHours, at = new Date()) {
    const timezone = getOpeningHoursTimezone(openingHours);
    let local;
    try {
        local = datePartsInTimezone(at, timezone);
    }
    catch {
        local = datePartsInTimezone(at, DEFAULT_LOCATION_TIMEZONE);
    }
    const dateStatus = getDateOperatingStatus(openingHours, local.date);
    return {
        ...dateStatus,
        timezone,
        localMinute: local.minute,
        isOpen: dateStatus.configured
            ? isMinuteWithinOperatingHours(dateStatus, local.minute)
            : null,
    };
}
export function getLocationOperatingStatus(location, at = new Date()) {
    return getCurrentOperatingStatus(getLocationOpeningHours(location), at);
}
