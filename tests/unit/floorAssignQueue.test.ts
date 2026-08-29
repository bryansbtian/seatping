import { beforeEach, describe, expect, it, vi } from "vitest";

const queueFindUnique = vi.fn();
const queueUpdateMany = vi.fn();
const assignmentUpdateMany = vi.fn();
const businessFindUnique = vi.fn();
const locationFindUnique = vi.fn();
const touchGuestByQueueEntryId = vi.fn();
const enqueueNotification = vi.fn();
const syncCustomerQueue = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      queueEntry: {
        findUnique: queueFindUnique,
        updateMany: queueUpdateMany,
      },
      tableAssignment: { updateMany: assignmentUpdateMany },
      business: { findUnique: businessFindUnique },
      location: { findUnique: locationFindUnique },
    },
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification };
});

vi.mock("../../server/lib/queueSync.js", () => {
  return { syncCustomerQueue };
});

vi.mock("../../server/lib/guests.js", () => {
  return {
    touchGuestByQueueEntryId,
    touchGuestByReservationId: vi.fn(),
  };
});

const {
  markQueueEntryAdmitted,
  markQueueEntryArrived,
  markQueueEntryNoShow,
  markQueueEntryRemoved,
  markVisitClosed,
} = await import("../../server/lib/floorAssign.js");

beforeEach(() => {
  vi.clearAllMocks();
  queueUpdateMany.mockResolvedValue({ count: 1 });
  assignmentUpdateMany.mockResolvedValue({ count: 1 });
  businessFindUnique.mockResolvedValue({ username: "bistro", name: "Bistro" });
  locationFindUnique.mockResolvedValue({ name: "Main", displayName: "PIK Avenue" });
});

describe("markQueueEntryAdmitted", () => {
  it("keeps a floor-assigned waiting guest in arrival confirmation", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "WAITING",
      admittedAt: null,
      businessId: "business-1",
      locationId: "location-1",
      firstName: "Bryan",
      lastName: "Susanto",
      notificationMethod: "sms",
      countryCode: "+1",
      phone: "2065550100",
      email: null,
    });

    await markQueueEntryAdmitted("queue-1");

    expect(queueUpdateMany).toHaveBeenCalledWith({
      where: { id: "queue-1", status: "WAITING" },
      data: {
        status: "ADMITTED",
        finalStatus: "pending",
        admittedAt: expect.any(Date),
      },
    });
    expect(syncCustomerQueue).toHaveBeenCalledWith(
      expect.objectContaining({ finalStatus: "pending" }),
      expect.objectContaining({ status: "admitted", businessUsername: "bistro" }),
    );
    expect(enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "queue_admitted", channel: "sms" }),
    );
    expect(touchGuestByQueueEntryId).toHaveBeenCalledWith("queue-1");
  });

  it("does not close arrival confirmation for an admitted guest", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "ADMITTED",
      admittedAt: new Date("2026-08-28T14:00:00.000Z"),
    });

    await markQueueEntryAdmitted("queue-1");

    expect(queueUpdateMany).not.toHaveBeenCalled();
    expect(touchGuestByQueueEntryId).not.toHaveBeenCalled();
  });

  it("does not send admission side effects when another request wins the transition", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "WAITING",
      admittedAt: null,
      businessId: "business-1",
      locationId: "location-1",
    });
    queueUpdateMany.mockResolvedValue({ count: 0 });

    await markQueueEntryAdmitted("queue-1");

    expect(syncCustomerQueue).not.toHaveBeenCalled();
    expect(enqueueNotification).not.toHaveBeenCalled();
    expect(touchGuestByQueueEntryId).not.toHaveBeenCalled();
  });
});

describe("markVisitClosed", () => {
  it("closes a pending arrival when its seated visit is completed", async () => {
    await markVisitClosed({ queueEntryId: "queue-1", reservationId: null });

    expect(queueUpdateMany).toHaveBeenCalledWith({
      where: { id: "queue-1", status: "ADMITTED" },
      data: { status: "ARRIVED", finalStatus: "arrived", arrivedAt: expect.any(Date) },
    });
    expect(touchGuestByQueueEntryId).toHaveBeenCalledWith("queue-1");
  });
});

describe("markQueueEntryArrived", () => {
  it("closes the arrival window of an admitted guest", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "ADMITTED",
      businessId: "business-1",
      locationId: "location-1",
      admittedAt: new Date("2026-08-28T14:00:00.000Z"),
    });

    const arrived = await markQueueEntryArrived("queue-1");

    expect(arrived).toBe(true);
    expect(queueUpdateMany).toHaveBeenCalledWith({
      where: { id: "queue-1", status: "ADMITTED" },
      data: { status: "ARRIVED", finalStatus: "arrived", arrivedAt: expect.any(Date) },
    });
    expect(syncCustomerQueue).toHaveBeenCalledWith(
      expect.objectContaining({ finalStatus: "arrived" }),
      expect.objectContaining({ status: "arrived" }),
    );
    expect(touchGuestByQueueEntryId).toHaveBeenCalledWith("queue-1");
  });

  it("leaves a guest who is still waiting alone", async () => {
    queueFindUnique.mockResolvedValue({ id: "queue-1", status: "WAITING" });

    const arrived = await markQueueEntryArrived("queue-1");

    expect(arrived).toBe(false);
    expect(queueUpdateMany).not.toHaveBeenCalled();
    expect(syncCustomerQueue).not.toHaveBeenCalled();
  });

  it("reports no transition when another request wins the race", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "ADMITTED",
      businessId: "business-1",
      locationId: "location-1",
    });
    queueUpdateMany.mockResolvedValue({ count: 0 });

    const arrived = await markQueueEntryArrived("queue-1");

    expect(arrived).toBe(false);
    expect(syncCustomerQueue).not.toHaveBeenCalled();
    expect(touchGuestByQueueEntryId).not.toHaveBeenCalled();
  });
});

describe("markQueueEntryNoShow", () => {
  it("marks the guest a no-show and releases the table they were holding", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "ADMITTED",
      businessId: "business-1",
      locationId: "location-1",
    });

    const marked = await markQueueEntryNoShow("queue-1");

    expect(marked).toBe(true);
    expect(queueUpdateMany).toHaveBeenCalledWith({
      where: { id: "queue-1", status: "ADMITTED" },
      data: { status: "NO_SHOW", finalStatus: "no_show", noShowAt: expect.any(Date) },
    });
    expect(assignmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ queueEntryId: "queue-1" }) }),
    );
    expect(syncCustomerQueue).toHaveBeenCalledWith(
      expect.objectContaining({ finalStatus: "no_show" }),
      expect.objectContaining({ status: "no_show" }),
    );
  });

  it("leaves a guest who was never admitted alone", async () => {
    queueFindUnique.mockResolvedValue({ id: "queue-1", status: "WAITING" });

    const marked = await markQueueEntryNoShow("queue-1");

    expect(marked).toBe(false);
    expect(queueUpdateMany).not.toHaveBeenCalled();
    expect(assignmentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("markQueueEntryRemoved", () => {
  it("takes a waiting guest off the list and releases any held table", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "WAITING",
      businessId: "business-1",
      locationId: "location-1",
    });

    const removed = await markQueueEntryRemoved("queue-1");

    expect(removed).toBe(true);
    expect(queueUpdateMany).toHaveBeenCalledWith({
      where: { id: "queue-1", status: "WAITING" },
      data: { status: "REMOVED", removedAt: expect.any(Date) },
    });
    expect(assignmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ queueEntryId: "queue-1" }) }),
    );
    expect(syncCustomerQueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: "queue-1" }),
      expect.objectContaining({ status: "removed" }),
    );
    expect(touchGuestByQueueEntryId).toHaveBeenCalledWith("queue-1");
  });

  it("leaves a guest who was already admitted alone", async () => {
    queueFindUnique.mockResolvedValue({ id: "queue-1", status: "ADMITTED" });

    const removed = await markQueueEntryRemoved("queue-1");

    expect(removed).toBe(false);
    expect(queueUpdateMany).not.toHaveBeenCalled();
    expect(assignmentUpdateMany).not.toHaveBeenCalled();
  });

  it("reports nothing changed when the guest left first", async () => {
    queueFindUnique.mockResolvedValue({
      id: "queue-1",
      status: "WAITING",
      businessId: "business-1",
      locationId: "location-1",
    });
    queueUpdateMany.mockResolvedValue({ count: 0 });

    const removed = await markQueueEntryRemoved("queue-1");

    expect(removed).toBe(false);
    expect(assignmentUpdateMany).not.toHaveBeenCalled();
    expect(syncCustomerQueue).not.toHaveBeenCalled();
  });

  it("does nothing for an entry that no longer exists", async () => {
    queueFindUnique.mockResolvedValue(null);

    const removed = await markQueueEntryRemoved("queue-1");

    expect(removed).toBe(false);
    expect(queueUpdateMany).not.toHaveBeenCalled();
  });
});
