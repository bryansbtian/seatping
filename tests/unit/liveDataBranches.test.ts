import { describe, expect, it } from "vitest";
import type { QueueEntry, Reservation } from "@prisma/client";
import {
  legacyKeyOf,
  queueEntryToLegacy,
  reconstructQueueArrays,
  reservationRowToLegacy,
  reservationStatusToEnum,
  reservationStatusToLegacy,
} from "../../server/lib/liveData.js";

function entry(overrides: Record<string, unknown> = {}): QueueEntry {
  return {
    id: `qe-${Math.random()}`,
    queueToken: `qt-${Math.random()}`,
    legacyKey: "lk",
    locationId: "loc-1",
    businessId: "biz-1",
    customerId: null,
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    notificationMethod: "email",
    email: "ada@test.invalid",
    phone: null,
    countryCode: null,
    smsConsent: null,
    smsMarketingConsent: null,
    status: "WAITING",
    joinedAt: new Date("2026-08-12T18:00:00.000Z"),
    admittedAt: null,
    arrivedAt: null,
    noShowAt: null,
    removedAt: null,
    leftAt: null,
    finalStatus: null,
    ...overrides,
  } as unknown as QueueEntry;
}

function reservation(overrides: Record<string, unknown> = {}): Reservation {
  return {
    id: "res-1",
    manageToken: "mt-1",
    locationId: "loc-1",
    businessId: "biz-1",
    businessUsername: "bistro",
    customerId: null,
    firstName: "Ada",
    lastName: "Lovelace",
    name: null,
    contactMethod: null,
    phone: null,
    countryCode: null,
    email: "ada@test.invalid",
    guestCount: 2,
    reservationDateTime: "2026-08-12T19:00",
    notes: null,
    status: "CONFIRMED",
    source: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    cancelledAt: null,
    arrivedAt: null,
    completedAt: null,
    noShowAt: null,
    reminderEmailSentAt: null,
    ...overrides,
  } as unknown as Reservation;
}

describe("legacyKeyOf", () => {
  it("joins the parts into one key", () => {
    expect(legacyKeyOf("Ada", "Lovelace", "2026-08-12")).toBe("AdaLovelace2026-08-12");
  });

  it("treats missing parts as empty", () => {
    expect(legacyKeyOf(null, undefined, null)).toBe("");
  });
});

describe("queueEntryToLegacy", () => {
  it("keeps a waiting guest at their given position", () => {
    const legacy = queueEntryToLegacy(entry(), { position: 3 });

    expect(legacy.status).toBeUndefined();
    expect(legacy.position).toBe(3);
    expect(legacy.name).toBe("Ada Lovelace");
    expect(legacy.countryCode).toBe("+1");
    expect(legacy.joinedAt).toBe("2026-08-12T18:00:00.000Z");
  });

  it("omits the position when none is given", () => {
    expect(queueEntryToLegacy(entry()).position).toBeUndefined();
  });

  it("stamps the business username when one is supplied", () => {
    const legacy = queueEntryToLegacy(entry(), { businessUsername: "bistro" });

    expect(legacy.businessUsername).toBe("bistro");
  });

  it("reports an admitted guest as pending", () => {
    const legacy = queueEntryToLegacy(
      entry({ status: "ADMITTED", admittedAt: new Date("2026-08-12T18:30:00.000Z") }),
    );

    expect(legacy.status).toBe("admitted");
    expect(legacy.finalStatus).toBe("pending");
    expect(legacy.admittedAt).toBe("2026-08-12T18:30:00.000Z");
  });

  it("derives arrived and no-show final statuses", () => {
    expect(queueEntryToLegacy(entry({ status: "ARRIVED" })).finalStatus).toBe("arrived");
    expect(queueEntryToLegacy(entry({ status: "NO_SHOW" })).finalStatus).toBe("no_show");
  });

  it("prefers a stored final status", () => {
    const legacy = queueEntryToLegacy(entry({ status: "ARRIVED", finalStatus: "seated" }));

    expect(legacy.finalStatus).toBe("seated");
  });

  it("distinguishes a guest who left from one who was removed", () => {
    expect(queueEntryToLegacy(entry({ status: "LEFT" })).status).toBe("left");
    expect(queueEntryToLegacy(entry({ status: "REMOVED" })).status).toBe("removed");
  });

  it("nulls timestamps that cannot be read", () => {
    const legacy = queueEntryToLegacy(
      entry({ status: "REMOVED", removedAt: "not a date", leftAt: null }),
    );

    expect(legacy.removedAt).toBeNull();
    expect(legacy.leftAt).toBeNull();
  });

  it("accepts a timestamp given as a string", () => {
    const legacy = queueEntryToLegacy(entry({ joinedAt: "2026-08-12T18:00:00.000Z" }));

    expect(legacy.joinedAt).toBe("2026-08-12T18:00:00.000Z");
  });
});

describe("reconstructQueueArrays", () => {
  it("splits the rows into waiting, admitted and removed lists", () => {
    const rows = [
      entry({ status: "REMOVED", removedAt: new Date("2026-08-12T17:00:00.000Z") }),
      entry({ status: "ADMITTED", admittedAt: new Date("2026-08-12T18:30:00.000Z") }),
      entry({ status: "WAITING", joinedAt: new Date("2026-08-12T18:10:00.000Z") }),
      entry({ status: "WAITING", joinedAt: new Date("2026-08-12T18:05:00.000Z") }),
    ];

    const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(rows);

    expect(queue).toHaveLength(2);
    expect(queue[0].joinedAt).toBe("2026-08-12T18:05:00.000Z");
    expect(queue[0].position).toBe(1);
    expect(queue[1].position).toBe(2);
    expect(admittedCustomers).toHaveLength(1);
    expect(removedCustomers).toHaveLength(1);
  });

  it("orders admitted guests by when they were admitted", () => {
    const rows = [
      entry({ status: "ARRIVED", admittedAt: new Date("2026-08-12T19:00:00.000Z") }),
      entry({ status: "ADMITTED", admittedAt: new Date("2026-08-12T18:00:00.000Z") }),
    ];

    const { admittedCustomers } = reconstructQueueArrays(rows);

    expect(admittedCustomers[0].admittedAt).toBe("2026-08-12T18:00:00.000Z");
    expect(admittedCustomers[0].finalStatus).toBe("pending");
    expect(admittedCustomers[1].finalStatus).toBe("arrived");
  });

  it("falls back to the join time when there is no admit time", () => {
    const rows = [
      entry({ status: "ADMITTED", joinedAt: new Date("2026-08-12T18:00:00.000Z") }),
      entry({ status: "ADMITTED", joinedAt: new Date("2026-08-12T17:00:00.000Z") }),
    ];

    const { admittedCustomers } = reconstructQueueArrays(rows);

    expect(admittedCustomers[0].joinedAt).toBe("2026-08-12T17:00:00.000Z");
  });

  it("keeps a stored final status and marks a no-show", () => {
    const rows = [
      entry({ status: "NO_SHOW", admittedAt: new Date("2026-08-12T18:00:00.000Z") }),
      entry({
        status: "ADMITTED",
        admittedAt: new Date("2026-08-12T18:30:00.000Z"),
        finalStatus: "seated",
      }),
    ];

    const { admittedCustomers } = reconstructQueueArrays(rows);

    expect(admittedCustomers[0].finalStatus).toBe("no_show");
    expect(admittedCustomers[1].finalStatus).toBe("seated");
  });

  it("orders removed guests by when they left the queue", () => {
    const rows = [
      entry({ status: "LEFT", leftAt: new Date("2026-08-12T19:00:00.000Z") }),
      entry({ status: "REMOVED", removedAt: new Date("2026-08-12T18:00:00.000Z") }),
      entry({ status: "REMOVED", joinedAt: new Date("2026-08-12T17:00:00.000Z") }),
    ];

    const { removedCustomers } = reconstructQueueArrays(rows);

    expect(removedCustomers.map((c) => c.status)).toEqual(["removed", "removed", "left"]);
  });

  it("stamps the business username on every list", () => {
    const rows = [
      entry({ status: "WAITING" }),
      entry({ status: "ADMITTED", admittedAt: new Date() }),
      entry({ status: "LEFT", leftAt: new Date() }),
    ];

    const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(rows, "bistro");

    expect(queue[0].businessUsername).toBe("bistro");
    expect(admittedCustomers[0].businessUsername).toBe("bistro");
    expect(removedCustomers[0].businessUsername).toBe("bistro");
  });

  it("leaves the username off when none is supplied", () => {
    const { queue } = reconstructQueueArrays([entry()]);

    expect(queue[0].businessUsername).toBeUndefined();
  });

  it("returns empty lists for no rows", () => {
    expect(reconstructQueueArrays([])).toEqual({
      queue: [],
      admittedCustomers: [],
      removedCustomers: [],
    });
  });
});

describe("reservation status mapping", () => {
  it("maps every stored status to its public name", () => {
    expect(reservationStatusToLegacy("CONFIRMED")).toBe("confirmed");
    expect(reservationStatusToLegacy("ARRIVED")).toBe("arrived");
    expect(reservationStatusToLegacy("COMPLETED")).toBe("completed");
    expect(reservationStatusToLegacy("CANCELLED")).toBe("cancelled");
    expect(reservationStatusToLegacy("NO_SHOW")).toBe("no_show");
  });

  it("falls back to confirmed for an unknown status", () => {
    expect(reservationStatusToLegacy("SOMETHING_ELSE")).toBe("confirmed");
  });

  it("maps a public name back to the stored status", () => {
    expect(reservationStatusToEnum("no_show")).toBe("NO_SHOW");
    expect(reservationStatusToEnum("ARRIVED")).toBe("ARRIVED");
    expect(reservationStatusToEnum("")).toBe("CONFIRMED");
    expect(reservationStatusToEnum(undefined as never)).toBe("CONFIRMED");
  });
});

describe("reservationRowToLegacy", () => {
  it("fills in the defaults for the optional fields", () => {
    const legacy = reservationRowToLegacy(reservation());

    expect(legacy.name).toBe("Ada Lovelace");
    expect(legacy.contactMethod).toBe("email");
    expect(legacy.phone).toBe("");
    expect(legacy.notes).toBe("");
    expect(legacy.source).toBe("seatping_public");
    expect(legacy.status).toBe("confirmed");
    expect(legacy.manageToken).toBeUndefined();
  });

  it("keeps the stored name when there is one", () => {
    const legacy = reservationRowToLegacy(reservation({ name: "A. Lovelace" }));

    expect(legacy.name).toBe("A. Lovelace");
  });

  it("includes the manage token only when asked", () => {
    const legacy = reservationRowToLegacy(reservation(), { includeToken: true });

    expect(legacy.manageToken).toBe("mt-1");
  });

  it("serialises every timestamp it has", () => {
    const legacy = reservationRowToLegacy(
      reservation({
        cancelledAt: new Date("2026-08-03T00:00:00.000Z"),
        arrivedAt: new Date("2026-08-04T00:00:00.000Z"),
        completedAt: new Date("2026-08-05T00:00:00.000Z"),
        noShowAt: new Date("2026-08-06T00:00:00.000Z"),
        reminderEmailSentAt: new Date("2026-08-07T00:00:00.000Z"),
        status: "CANCELLED",
      }),
    );

    expect(legacy.cancelledAt).toBe("2026-08-03T00:00:00.000Z");
    expect(legacy.arrivedAt).toBe("2026-08-04T00:00:00.000Z");
    expect(legacy.completedAt).toBe("2026-08-05T00:00:00.000Z");
    expect(legacy.noShowAt).toBe("2026-08-06T00:00:00.000Z");
    expect(legacy.reminderEmailSentAt).toBe("2026-08-07T00:00:00.000Z");
    expect(legacy.status).toBe("cancelled");
  });

  it("treats a non-numeric party size as zero", () => {
    const legacy = reservationRowToLegacy(reservation({ guestCount: "many" as never }));

    expect(legacy.partySize).toBe(0);
  });
});
