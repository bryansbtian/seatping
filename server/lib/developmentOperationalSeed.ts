import { randomUUID } from "node:crypto";
import {
  CampaignChannel,
  CampaignStatus,
  CampaignTemplateApprovalStatus,
  QueueStatus,
  ReservationStatus,
  type Prisma,
  type QueueEntry,
  type Reservation,
} from "@prisma/client";
import { buildSummary, computeStats } from "./guests.js";
import { zonedWallTimeToMs } from "./reservations.js";

const DAY = 86400000;
const MINUTE = 60000;
const TIMEZONE = "Asia/Jakarta";
const NAMES = [
  "Alex Morgan",
  "Jamie Chen",
  "Taylor Brooks",
  "Riley Parker",
  "Jordan Lee",
  "Casey Rivera",
  "Avery Patel",
  "Morgan Reed",
  "Quinn Davis",
  "Rowan Kim",
  "Sage Wilson",
  "Harper Lane",
  "Emery Scott",
  "Finley Moore",
  "Reese Clark",
  "Dakota Ellis",
  "Blair Adams",
  "Skyler Bennett",
  "Cameron Hayes",
  "Peyton James",
  "Kendall Ross",
  "Remy Flores",
  "Drew Carter",
  "Sam Miller",
];

function wallClock(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}`;
}

function instant(wall: string): Date {
  return new Date(zonedWallTimeToMs(wall.slice(0, 10), wall.slice(11, 16), TIMEZONE));
}

export async function seedOperationalExamples(
  tx: Prisma.TransactionClient,
  password: string,
  now: Date,
): Promise<void> {
  for (let branch = 0; branch < 2; branch += 1) {
    await seedLocationExamples(tx, branch, password, now);
  }
  for (const [index, isActive] of [true, false].entries()) {
    const id = `dev-demo-seatping-template-${index}`;
    const data = {
      templateType: "SEATPING" as const,
      approvalStatus: "APPROVED" as const,
      name: ["A Warm Welcome", "Archived Seasonal Greeting"][index],
      body: "Hi {{first_name}}, we look forward to welcoming you to {{business_name}} soon.",
      variables: ["first_name", "business_name"],
      exampleValues: { first_name: "Alex", business_name: "Harbor Kitchen" },
      slug: `dev_demo_seatping_${index}`,
      isActive,
      approvedAt: now,
    };
    await tx.campaignTemplate.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  await tx.location.upsert({
    where: { id: "dev-demo-empty-location" },
    update: {},
    create: {
      id: "dev-demo-empty-location",
      businessId: "dev-demo-business-0",
      businessUsername: "demo-restaurant-1",
      name: "New Branch",
      displayName: "New Branch (Empty States)",
      address: "200 Demo Street",
      city: "Jakarta",
      country: "Indonesia",
      queueEnabled: false,
      reservationsEnabled: false,
      credits: 0,
      isPublished: false,
    },
  });
}

async function seedLocationExamples(
  tx: Prisma.TransactionClient,
  branch: number,
  password: string,
  now: Date,
): Promise<void> {
  const businessId = `dev-demo-business-${branch}`;
  const locationId = `dev-demo-location-${branch}`;
  const businessUsername = `demo-restaurant-${branch + 1}`;
  const customerId = `dev-demo-customer-${branch}`;
  const scope = { businessId, locationId };
  let name = "Harbor Kitchen";
  let customerUsername = "demo-diner";
  let guestCap = 0;
  if (branch === 1) {
    name = "Garden Table";
    customerUsername = "demo-diner-2";
    guestCap = 20;
  }
  const hours: Record<string, Prisma.InputJsonValue> = { timezone: TIMEZONE };
  for (const day of [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]) {
    hours[day] = { enabled: true, open: "00:00", close: "23:59" };
  }
  await tx.location.update({
    where: { id: locationId },
    data: {
      isPublished: true,
      latitude: -6.2 + branch * 0.02,
      longitude: 106.82 + branch * 0.02,
      bannerImageUrl: "/placeholder.svg",
      reservationSettings: {
        reservationStartTime: "00:00",
        reservationEndTime: "23:59",
        maxPartySize: 8,
        maxReservedGuestsPerHour: guestCap,
        bookingWindowDays: 30,
        minNoticeMinutes: 0,
        defaultReservationDurationMinutes: 90,
        reservationHoldMinutes: 15,
        confirmationMode: "auto",
        cancellationPolicy: "Please cancel if your plans change.",
      },
      restaurantProfile: {
        displayName: name,
        shortAddress: "Main Branch, Jakarta",
        tagline: "Good Food And A Warm Welcome",
        description: "A fictional restaurant for exploring SeatPing locally.",
        cuisineTypes: ["Indonesian", "International"],
        priceRange: "$$",
        currency: "IDR",
        openingHours: hours,
        details: { address: "100 Demo Street", city: "Jakarta", country: "Indonesia" },
        menu: [
          {
            name: "Garden Salad",
            description: "Seasonal greens and citrus dressing.",
            price: 65000,
            currency: "IDR",
            category: "Starters",
          },
          {
            name: "Grilled Mushroom Rice",
            description: "Fragrant rice with roasted mushrooms.",
            price: 95000,
            currency: "IDR",
            category: "Main Courses",
          },
          { name: "Coconut Pudding", price: 45000, currency: "IDR", category: "Desserts" },
        ],
      },
    },
  });
  await tx.user.upsert({
    where: { id: customerId },
    update: { password },
    create: {
      id: customerId,
      name: NAMES[0],
      username: customerUsername,
      email: `demo-guest-${branch}-0@example.test`,
      phone: "+12025550100",
      password,
    },
  });
  const tables = await seedFloor(tx, branch, now);
  const allQueues: QueueEntry[] = [];
  const allReservations: Reservation[] = [];
  for (const [index, fullName] of NAMES.entries()) {
    const guestId = `dev-demo-guest-${branch}-${index}`;
    const [firstName, lastName] = fullName.split(" ");
    const email = `demo-guest-${branch}-${index}@example.test`;
    const phone = `+120255501${String(index).padStart(2, "0")}`;
    const queues: QueueEntry[] = [];
    const reservations: Reservation[] = [];
    let linkedCustomer: string | null = null;
    if (index === 0) {
      linkedCustomer = customerId;
    }
    const contact = {
      ...scope,
      firstName,
      lastName,
      email,
      phone,
      countryCode: "+1",
      customerId: linkedCustomer,
    };
    let historyCount = index % 6;
    if (index === 0) {
      historyCount = 2;
    }
    for (let visit = 0; visit < historyCount; visit += 1) {
      const at = new Date(now.getTime() - (index * 4 + visit * 7 + 1) * DAY);
      const historyDate = `${wallClock(at).slice(0, 10)}T${String(10 + (index % 8)).padStart(2, "0")}:00`;
      if (visit % 2 === 1) {
        const id = `${guestId}-queue-history-${visit}`;
        const arrivedAt = instant(historyDate);
        const joinedAt = new Date(arrivedAt.getTime() - 15 * MINUTE);
        const data = {
          ...contact,
          queueToken: randomUUID(),
          legacyKey: `${firstName}${lastName}${joinedAt.toISOString()}`,
          guestCount: 2 + (index % 4),
          notificationMethod: "email",
          status: "ARRIVED" as const,
          finalStatus: "arrived",
          joinedAt,
          arrivedAt,
          admittedAt: new Date(arrivedAt.getTime() - 5 * MINUTE),
          createdAt: joinedAt,
        };
        const queue = await tx.queueEntry.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
        queues.push(queue);
        if (tables.length > 0) {
          await seedQueueAssignment(tx, queue, tables[3], guestId, now);
        }
        continue;
      }
      const reservation = await seedReservation(
        tx,
        {
          ...contact,
          id: `${guestId}-history-${visit}`,
          businessUsername,
          status: "COMPLETED",
          reservationDateTime: historyDate,
          guestCount: 2 + (index % 4),
        },
        now,
      );
      reservations.push(reservation);
      if (tables.length > 0) {
        await seedReservationAssignment(tx, reservation, tables[3], guestId);
      }
    }
    if (index === 0) {
      for (const [offset, status] of ["CANCELLED", "NO_SHOW"].entries()) {
        reservations.push(
          await seedReservation(
            tx,
            {
              ...contact,
              id: `${guestId}-past-${offset}`,
              businessUsername,
              status: status as "CANCELLED" | "NO_SHOW",
              guestCount: 2,
              reservationDateTime: wallClock(new Date(now.getTime() - (offset + 3) * DAY)),
            },
            now,
          ),
        );
      }
    }
    if (index < Object.values(QueueStatus).length) {
      const status = Object.values(QueueStatus)[index];
      const joinedAt = new Date(now.getTime() - (45 + index * 4) * MINUTE);
      let finalStatus: string | null = null;
      let admittedAt: Date | null = null;
      let arrivedAt: Date | null = null;
      let noShowAt: Date | null = null;
      let removedAt: Date | null = null;
      let leftAt: Date | null = null;
      if (["ADMITTED", "ARRIVED", "NO_SHOW"].includes(status)) {
        admittedAt = new Date(joinedAt.getTime() + 15 * MINUTE);
        finalStatus = "pending";
      }
      if (status === "ARRIVED") {
        arrivedAt = new Date(now.getTime() - 20 * MINUTE);
        finalStatus = "arrived";
      } else if (status === "NO_SHOW") {
        noShowAt = new Date(now.getTime() - 5 * MINUTE);
        finalStatus = "no_show";
      } else if (status === "REMOVED") {
        removedAt = new Date(now.getTime() - 5 * MINUTE);
      } else if (status === "LEFT") {
        leftAt = new Date(now.getTime() - 5 * MINUTE);
      }
      const id = `dev-demo-queue-${branch}-${index}`;
      const data = {
        ...contact,
        queueToken: randomUUID(),
        legacyKey: `${firstName}${lastName}${joinedAt.toISOString()}`,
        guestCount: 2 + (index % 4),
        notificationMethod: "email",
        status,
        finalStatus,
        joinedAt,
        admittedAt,
        arrivedAt,
        noShowAt,
        removedAt,
        leftAt,
        createdAt: joinedAt,
        smsConsent: false,
        smsMarketingConsent: false,
      };
      const queue = await tx.queueEntry.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      queues.push(queue);
      if (status === "ARRIVED" && tables.length > 0) {
        await seedQueueAssignment(tx, queue, tables[1], guestId, now);
      }
    }
    if (index < Object.values(ReservationStatus).length) {
      const status = Object.values(ReservationStatus)[index];
      let at = new Date(now.getTime() - (index + 1) * DAY);
      if (status === "CONFIRMED") {
        at = new Date(now.getTime() + 45 * MINUTE);
      } else if (status === "ARRIVED") {
        at = new Date(now.getTime() - 25 * MINUTE);
      }
      const reservation = await seedReservation(
        tx,
        {
          ...contact,
          id: `dev-demo-reservation-${branch}-${index}`,
          businessUsername,
          status,
          reservationDateTime: wallClock(at),
          guestCount: 2 + (index % 4),
          notes: "Fictional local demo booking. Prefers a quiet table.",
          needsReview: index === 0,
          needsReviewReason: "Please review the guest's accessible seating request.",
        },
        now,
      );
      reservations.push(reservation);
      if (tables.length > 0) {
        let tableId = tables[3];
        if (status === "CONFIRMED") {
          tableId = tables[0];
        }
        await seedReservationAssignment(tx, reservation, tableId, guestId);
      }
    }
    if (index === 6) {
      const reservation = await seedReservation(
        tx,
        {
          ...contact,
          id: `dev-demo-upcoming-${branch}`,
          businessUsername,
          status: "CONFIRMED",
          guestCount: 4,
          reservationDateTime: wallClock(new Date(now.getTime() + DAY)),
        },
        now,
      );
      reservations.push(reservation);
      if (tables.length > 0) {
        await seedReservationAssignment(tx, reservation, tables[0], guestId);
      }
    }
    const stats = computeStats(queues, reservations, TIMEZONE);
    const tags: string[] = [];
    if (index % 3 === 0) {
      tags.push("VIP");
    }
    if (stats.totalVisits > 1) {
      tags.push("Regular");
    }
    if (index % 5 === 0) {
      tags.push("Prefers Window Seat");
    }
    let notes: string | null = null;
    if (index % 2 === 0) {
      notes = "Fictional guest note: prefers a quiet table and sparkling water.";
    }
    const data = {
      ...scope,
      businessUsername,
      firstName,
      lastName,
      fullName,
      email,
      phone,
      normalizedEmail: email,
      normalizedPhone: phone.slice(1),
      tags,
      notes,
      totalVisits: stats.totalVisits,
      firstVisitAt: stats.firstVisitAt,
      lastVisitAt: stats.lastVisitAt,
      upcomingReservationCount: stats.upcomingReservationCount,
      pastReservationCount: stats.pastReservationCount,
      waitlistVisitCount: stats.waitlistVisitCount,
      noShowCount: stats.noShowCount,
      cancelledCount: stats.cancelledCount,
      sourceQueueEntryIds: queues.map((row) => row.id),
      sourceReservationIds: reservations.map((row) => row.id),
      summary: buildSummary(stats, TIMEZONE),
      emailMarketingOptIn: index % 4 !== 0,
      whatsappMarketingOptIn: index % 4 !== 1,
      smsMarketingOptIn: index % 4 !== 2,
      emailMarketingOptOutAt: null as Date | null,
      whatsappMarketingOptOutAt: null as Date | null,
      smsMarketingOptOutAt: null as Date | null,
    };
    if (!data.emailMarketingOptIn) {
      data.emailMarketingOptOutAt = new Date(now.getTime() - DAY);
    }
    if (!data.whatsappMarketingOptIn) {
      data.whatsappMarketingOptOutAt = new Date(now.getTime() - DAY);
    }
    if (!data.smsMarketingOptIn) {
      data.smsMarketingOptOutAt = new Date(now.getTime() - DAY);
    }
    await tx.guestProfile.upsert({
      where: { id: guestId },
      create: { id: guestId, ...data },
      update: data,
    });
    allQueues.push(...queues);
    allReservations.push(...reservations);
  }
  await seedCapacity(tx, locationId);
  await seedConsumerActivity(tx, customerId, businessUsername, name, allQueues, allReservations);
  for (const [index, fullName] of [
    "Imported Guest Without Email",
    "Imported Guest Without Phone",
    "Imported Guest Without Contact",
  ].entries()) {
    let email: string | null = null;
    let phone: string | null = null;
    if (index === 0) {
      phone = "+12025550198";
    } else if (index === 1) {
      email = `demo-imported-${branch}@example.test`;
    }
    let normalizedPhone: string | null = null;
    if (phone) {
      normalizedPhone = phone.slice(1);
    }
    const id = `dev-demo-imported-guest-${branch}-${index}`;
    const data = {
      ...scope,
      businessUsername,
      fullName,
      email,
      phone,
      normalizedEmail: email,
      normalizedPhone,
      emailMarketingOptIn: false,
      whatsappMarketingOptIn: false,
      smsMarketingOptIn: false,
      tags: ["Imported"],
      notes: "Fictional imported contact for testing missing information.",
    };
    await tx.guestProfile.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  await seedReviewsAndPhotos(tx, branch, now);
  await seedCampaignExamples(tx, branch, now);
}

async function seedReservation(
  tx: Prisma.TransactionClient,
  input: Omit<Prisma.ReservationUncheckedCreateInput, "manageToken"> & { id: string },
  now: Date,
): Promise<Reservation> {
  const start = instant(input.reservationDateTime);
  const data: Prisma.ReservationUncheckedCreateInput = {
    ...input,
    manageToken: randomUUID(),
    contactMethod: "email",
    source: "website",
    createdAt: new Date(start.getTime() - 2 * DAY),
    reminderEmailSentAt: now,
    arrivedAt: null,
    completedAt: null,
    cancelledAt: null,
    noShowAt: null,
  };
  if (input.status === "ARRIVED" || input.status === "COMPLETED") {
    data.arrivedAt = start;
  }
  if (input.status === "COMPLETED") {
    data.completedAt = new Date(start.getTime() + 75 * MINUTE);
  } else if (input.status === "CANCELLED") {
    data.cancelledAt = new Date(start.getTime() - DAY);
  } else if (input.status === "NO_SHOW") {
    data.noShowAt = new Date(start.getTime() + 30 * MINUTE);
  }
  return tx.reservation.upsert({ where: { id: input.id }, create: data, update: data });
}

async function seedFloor(
  tx: Prisma.TransactionClient,
  branch: number,
  now: Date,
): Promise<string[]> {
  if (branch !== 0) {
    return [];
  }
  const scope = { businessId: "dev-demo-business-0", locationId: "dev-demo-location-0" };
  const ids: string[] = [];
  for (const [index, name] of ["Main Dining Room", "Garden Terrace"].entries()) {
    const id = `dev-demo-floor-${index}`;
    await tx.floorPlan.upsert({
      where: { id },
      update: {},
      create: { id, ...scope, name, sortOrder: index },
    });
    const zoneId = `${id}-zone`;
    await tx.floorZone.upsert({
      where: { id: zoneId },
      update: {},
      create: {
        id: zoneId,
        ...scope,
        floorPlanId: id,
        name: "Window Seating",
        x: 40,
        y: 40,
        width: 700,
        height: 280,
      },
    });
    for (let offset = 0; offset < 4; offset += 1) {
      const tableIndex = index * 4 + offset;
      const tableId = `dev-demo-table-${tableIndex}`;
      let shape: "ROUND" | "SQUARE" | "RECTANGLE" = "RECTANGLE";
      if (tableIndex % 3 === 0) {
        shape = "ROUND";
      } else if (tableIndex % 3 === 1) {
        shape = "SQUARE";
      }
      let cleaningSince: Date | null = null;
      if (tableIndex === 4) {
        cleaningSince = new Date(now.getTime() - 5 * MINUTE);
      }
      const data = {
        ...scope,
        floorPlanId: id,
        name: `T${tableIndex + 1}`,
        capacity: [4, 4, 2, 6, 4, 8, 4, 6][tableIndex],
        shape,
        x: 80 + (offset % 2) * 300,
        y: 80 + Math.floor(offset / 2) * 250,
        width: 120,
        height: 100,
        isBlocked: tableIndex === 5,
        cleaningSince,
      };
      await tx.diningTable.upsert({
        where: { id: tableId },
        create: { id: tableId, ...data },
        update: data,
      });
      ids.push(tableId);
    }
  }
  const assignmentId = "dev-demo-walk-in-assignment";
  const data = {
    ...scope,
    tableId: ids[6],
    tableIds: [ids[6], ids[7]],
    partySize: 8,
    source: "MANUAL" as const,
    status: "SEATED" as const,
    assignedAt: new Date(now.getTime() - 10 * MINUTE),
    seatedAt: new Date(now.getTime() - 10 * MINUTE),
    expectedStartAt: new Date(now.getTime() - 10 * MINUTE),
    expectedEndAt: new Date(now.getTime() + 80 * MINUTE),
  };
  await tx.tableAssignment.upsert({
    where: { id: assignmentId },
    create: { id: assignmentId, ...data },
    update: data,
  });
  return ids;
}

async function seedReservationAssignment(
  tx: Prisma.TransactionClient,
  reservation: Reservation,
  tableId: string,
  guestId: string,
) {
  const id = `${reservation.id}-table`;
  const expectedStartAt = instant(reservation.reservationDateTime);
  let status: "RESERVED" | "SEATED" | "COMPLETED" | "CANCELLED" = "RESERVED";
  if (reservation.status === "ARRIVED") {
    status = "SEATED";
  } else if (reservation.status === "COMPLETED") {
    status = "COMPLETED";
  } else if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
    status = "CANCELLED";
  }
  const data = {
    businessId: reservation.businessId,
    locationId: reservation.locationId,
    tableId,
    tableIds: [tableId],
    reservationId: reservation.id,
    guestProfileId: guestId,
    partySize: reservation.guestCount,
    source: "SMART" as const,
    status,
    assignedAt: reservation.createdAt,
    expectedStartAt,
    expectedEndAt: new Date(expectedStartAt.getTime() + 90 * MINUTE),
    seatedAt: reservation.arrivedAt,
    completedAt: reservation.completedAt,
    cancelledAt: reservation.cancelledAt ?? reservation.noShowAt,
  };
  await tx.tableAssignment.upsert({ where: { id }, create: { id, ...data }, update: data });
}

async function seedQueueAssignment(
  tx: Prisma.TransactionClient,
  queue: QueueEntry,
  tableId: string,
  guestId: string,
  now: Date,
) {
  const id = `${queue.id}-table`;
  const start = queue.arrivedAt ?? now;
  const end = new Date(start.getTime() + 90 * MINUTE);
  let status: "SEATED" | "COMPLETED" = "SEATED";
  let completedAt: Date | null = null;
  if (end < now) {
    status = "COMPLETED";
    completedAt = end;
  }
  const data = {
    businessId: queue.businessId,
    locationId: queue.locationId,
    tableId,
    tableIds: [tableId],
    queueEntryId: queue.id,
    guestProfileId: guestId,
    partySize: queue.guestCount,
    source: "SMART" as const,
    status,
    completedAt,
    assignedAt: queue.arrivedAt ?? now,
    seatedAt: queue.arrivedAt,
    expectedStartAt: start,
    expectedEndAt: end,
  };
  await tx.tableAssignment.upsert({ where: { id }, create: { id, ...data }, update: data });
}

async function seedCapacity(tx: Prisma.TransactionClient, locationId: string) {
  const reservations = await tx.reservation.findMany({
    where: { locationId, status: { in: ["CONFIRMED", "ARRIVED"] } },
  });
  const buckets = new Map<string, number>();
  for (const row of reservations) {
    const key = row.reservationDateTime.slice(0, 13);
    buckets.set(key, (buckets.get(key) ?? 0) + row.guestCount);
  }
  for (const [key, reservedGuests] of buckets) {
    const dateKey = key.slice(0, 10);
    const hour = Number(key.slice(11, 13));
    const id = `${locationId}-slot-${dateKey}-${hour}`;
    await tx.slotCounter.upsert({
      where: { locationId_dateKey_hour: { locationId, dateKey, hour } },
      create: { id, locationId, dateKey, hour, reservedGuests },
      update: { reservedGuests },
    });
  }
  await tx.slotCounter.deleteMany({
    where: {
      locationId,
      id: { startsWith: `${locationId}-slot-` },
      NOT: [...buckets.keys()].map((key) => ({
        dateKey: key.slice(0, 10),
        hour: Number(key.slice(11, 13)),
      })),
    },
  });
}

async function seedConsumerActivity(
  tx: Prisma.TransactionClient,
  customerId: string,
  businessUsername: string,
  businessName: string,
  queues: QueueEntry[],
  reservations: Reservation[],
) {
  const upcoming: Prisma.InputJsonObject[] = [];
  const past: Prisma.InputJsonObject[] = [];
  for (const row of reservations.filter((entry) => entry.customerId === customerId)) {
    const item = {
      id: row.id,
      manageToken: row.manageToken,
      locationId: row.locationId,
      businessUsername,
      businessName,
      locationName: "Main Branch",
      date: row.reservationDateTime.slice(0, 10),
      time: row.reservationDateTime.slice(11, 16),
      people: row.guestCount,
      status: row.status.toLowerCase(),
      createdAt: row.createdAt.toISOString(),
    };
    if (row.status === "CONFIRMED" || row.status === "ARRIVED") {
      upcoming.push(item);
    } else {
      past.push(item);
    }
  }
  const activity = queues
    .filter((row) => row.customerId === customerId)
    .map((row) => ({
      id: row.queueToken,
      queueToken: row.queueToken,
      entryKey: row.legacyKey,
      businessUsername,
      businessName,
      locationName: "Main Branch",
      locationId: row.locationId,
      joinedAt: row.joinedAt.toISOString(),
      partySize: row.guestCount,
      notificationMethod: row.notificationMethod,
      status: row.status.toLowerCase(),
      active: row.status === "WAITING",
      admittedAt: row.admittedAt?.toISOString() ?? null,
      confirmedAt: row.arrivedAt?.toISOString() ?? null,
      noShowMarkedAt: row.noShowAt?.toISOString() ?? null,
      removedAt: row.removedAt?.toISOString() ?? null,
      leftAt: row.leftAt?.toISOString() ?? null,
    }));
  await tx.user.update({
    where: { id: customerId },
    data: {
      upcomingReservations: upcoming,
      pastReservations: past,
      queueingActivity: activity,
      savedRestaurants: [
        {
          id: businessUsername,
          businessUsername,
          businessName,
          locationId: reservations[0]?.locationId ?? null,
          locationName: "Main Branch",
          city: "Jakarta",
        },
      ],
    },
  });
}

async function seedReviewsAndPhotos(tx: Prisma.TransactionClient, branch: number, now: Date) {
  const locationId = `dev-demo-location-${branch}`;
  for (let index = 0; index < 12; index += 1) {
    const id = `dev-demo-review-${branch}-${index}`;
    let businessReply: string | null = null;
    let repliedAt: Date | null = null;
    if (index % 2 === 0) {
      businessReply = "Thank you for visiting. Your feedback helps our team improve.";
      repliedAt = new Date(now.getTime() - index * DAY);
    }
    const data = {
      locationId,
      customerName: NAMES[index],
      customerId: null as string | null,
      customerUsername: null as string | null,
      rating: 1 + (index % 5),
      description: [
        "A welcoming team and a lovely meal.",
        "The food was good, but service took longer than expected.",
        "We enjoyed the seasonal menu and would visit again.",
      ][index % 3],
      partySize: 2 + (index % 4),
      serviceType: "reservation",
      businessReply,
      businessReplyCreatedAt: repliedAt,
      businessReplyUpdatedAt: repliedAt,
      createdAt: new Date(now.getTime() - (index + 1) * DAY),
    };
    if (index === 0) {
      data.customerId = `dev-demo-customer-${branch}`;
      data.customerUsername = "demo-diner";
      if (branch === 1) {
        data.customerUsername = "demo-diner-2";
      }
    }
    await tx.review.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (let index = 0; index < 3; index += 1) {
    const id = `dev-demo-photo-${branch}-${index}`;
    await tx.photo.upsert({
      where: { id },
      update: {},
      create: {
        id,
        locationId,
        url: "/placeholder.svg",
        publicId: id,
        altText: "Fictional Restaurant Placeholder",
      },
    });
  }
}

async function seedCampaignExamples(tx: Prisma.TransactionClient, branch: number, now: Date) {
  const scope = {
    businessId: `dev-demo-business-${branch}`,
    locationId: `dev-demo-location-${branch}`,
    businessUsername: `demo-restaurant-${branch + 1}`,
  };
  for (const [index, approvalStatus] of Object.values(CampaignTemplateApprovalStatus).entries()) {
    const id = `dev-demo-operational-template-${branch}-${index}`;
    let submittedAt: Date | null = null;
    let approvedAt: Date | null = null;
    let rejectedAt: Date | null = null;
    let rejectionReason: string | null = null;
    if (approvalStatus !== "DRAFT") {
      submittedAt = new Date(now.getTime() - 2 * DAY);
    }
    if (approvalStatus === "APPROVED") {
      approvedAt = new Date(now.getTime() - DAY);
    } else if (approvalStatus === "REJECTED") {
      rejectedAt = new Date(now.getTime() - DAY);
      rejectionReason = "Please include a clear expiry date for this offer.";
    }
    const data = {
      ...scope,
      templateType: "CUSTOM" as const,
      approvalStatus,
      name: [
        "Seasonal Menu Draft",
        "Weekend Invitation",
        "Guest Appreciation",
        "Offer Needs Revision",
      ][index],
      slug: `demo_operational_${branch}_${index}`,
      purpose: "A fictional campaign for exploring the dashboard.",
      body: "Hi {{first_name}}, join us at {{business_name}} for {{offer}}. We look forward to seeing you soon.",
      variables: ["first_name", "business_name", "offer"],
      exampleValues: {
        first_name: "Alex",
        business_name: "Harbor Kitchen",
        offer: "our seasonal menu",
      },
      submittedAt,
      approvedAt,
      rejectedAt,
      rejectionReason,
    };
    await tx.campaignTemplate.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  const audiences: Array<{ name: string; filters: Prisma.InputJsonObject }> = [
    { name: "VIP Regulars", filters: { tags: ["VIP"], totalVisitsMin: 2 } },
    { name: "Guests To Welcome Back", filters: { lastVisitMinDaysAgo: 30 } },
    { name: "Upcoming Guests", filters: { hasUpcomingReservation: true } },
  ];
  for (const [index, { name, filters }] of audiences.entries()) {
    const id = `dev-demo-audience-${branch}-${index}`;
    const data = {
      ...scope,
      name,
      description: "Fictional saved audience for local exploration.",
      filters,
    };
    await tx.savedAudience.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (const channel of Object.values(CampaignChannel)) {
    for (const [index, status] of Object.values(CampaignStatus).entries()) {
      const id = `dev-demo-campaign-${branch}-${channel.toLowerCase()}-${status.toLowerCase()}`;
      let sendMode: "NOW" | "SCHEDULED" | "RECURRING" = "NOW";
      let scheduledAt: Date | null = null;
      let recurrenceFrequency: "WEEKLY" | null = null;
      let recurrenceStartAt: Date | null = null;
      if (status === "SCHEDULED") {
        sendMode = "SCHEDULED";
        scheduledAt = new Date(now.getTime() + DAY);
      } else if (status === "RECURRING" || status === "PAUSED") {
        sendMode = "RECURRING";
        recurrenceFrequency = "WEEKLY";
        recurrenceStartAt = new Date(now.getTime() + DAY);
      }
      let runStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null = null;
      if (status === "SCHEDULED") {
        runStatus = "PENDING";
      } else if (status === "SENDING") {
        runStatus = "RUNNING";
      } else if (status === "SENT" || status === "RECURRING" || status === "PAUSED") {
        runStatus = "COMPLETED";
      } else if (status === "FAILED") {
        runStatus = "FAILED";
      }
      let recipientStatuses: Array<"PENDING" | "SENT" | "DELIVERED" | "FAILED" | "SKIPPED"> = [];
      if (runStatus === "PENDING") {
        recipientStatuses = ["PENDING", "PENDING", "PENDING", "PENDING", "PENDING"];
      } else if (runStatus === "RUNNING") {
        recipientStatuses = ["PENDING", "SENT", "DELIVERED", "FAILED", "SKIPPED"];
      } else if (runStatus === "COMPLETED") {
        recipientStatuses = ["DELIVERED", "DELIVERED", "SENT", "FAILED", "SKIPPED"];
      } else if (runStatus === "FAILED") {
        recipientStatuses = ["FAILED", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED"];
      }
      const counts = {
        recipientCount: recipientStatuses.length,
        sentCount: recipientStatuses.filter((value) => value === "SENT" || value === "DELIVERED")
          .length,
        failedCount: recipientStatuses.filter((value) => value === "FAILED").length,
        skippedCount: recipientStatuses.filter((value) => value === "SKIPPED").length,
      };
      let sentAt: Date | null = null;
      if (runStatus === "COMPLETED" || runStatus === "FAILED" || runStatus === "RUNNING") {
        sentAt = new Date(now.getTime() - DAY);
      }
      const label = status
        .toLowerCase()
        .split("_")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");
      const channelName = { EMAIL: "Email", WHATSAPP: "WhatsApp", SMS: "SMS" }[channel];
      const data = {
        ...scope,
        name: `${channelName} ${label} Example`,
        channel,
        status,
        templateId: `dev-demo-operational-template-${branch}-2`,
        templateValues: { offer: "our seasonal menu" },
        audienceType: "all_guests",
        ...counts,
        sendMode,
        scheduledAt,
        recurrenceFrequency,
        recurrenceStartAt,
        timezone: TIMEZONE,
        nextRunAt: null,
        isPaused: status === "PAUSED",
        sentAt,
        createdAt: new Date(now.getTime() - (index + 1) * DAY),
      };
      await tx.campaign.upsert({ where: { id }, create: { id, ...data }, update: data });
      if (!runStatus) {
        continue;
      }
      const runId = `${id}-run`;
      let completedAt: Date | null = null;
      if (runStatus === "COMPLETED" || runStatus === "FAILED") {
        completedAt = sentAt;
      }
      let runType: "MANUAL" | "SCHEDULED" | "RECURRING" = "MANUAL";
      if (sendMode === "SCHEDULED") {
        runType = "SCHEDULED";
      } else if (sendMode === "RECURRING") {
        runType = "RECURRING";
      }
      const runData = {
        campaignId: id,
        businessId: scope.businessId,
        runType,
        scheduledFor: scheduledAt,
        status: runStatus,
        ...counts,
        startedAt: sentAt,
        completedAt,
      };
      await tx.campaignRun.upsert({
        where: { id: runId },
        create: { id: runId, ...runData },
        update: runData,
      });
      for (const [recipientIndex, recipientStatus] of recipientStatuses.entries()) {
        const recipientId = `${id}-recipient-${recipientIndex}`;
        let recipientSentAt: Date | null = null;
        let deliveredAt: Date | null = null;
        let failedAt: Date | null = null;
        let skipReason: string | null = null;
        let errorMessage: string | null = null;
        if (recipientStatus === "SENT" || recipientStatus === "DELIVERED") {
          recipientSentAt = new Date(now.getTime() - DAY);
        }
        if (recipientStatus === "DELIVERED") {
          deliveredAt = new Date(now.getTime() - DAY + MINUTE);
        } else if (recipientStatus === "FAILED") {
          failedAt = new Date(now.getTime() - DAY);
          errorMessage = "Simulated delivery failure. No provider was contacted.";
        } else if (recipientStatus === "SKIPPED") {
          skipReason = "Simulated marketing opt-out.";
        }
        const recipientData = {
          campaignId: id,
          runId,
          businessId: scope.businessId,
          guestProfileId: `dev-demo-guest-${branch}-${recipientIndex}`,
          channel,
          email: `demo-guest-${branch}-${recipientIndex}@example.test`,
          phone: `+120255501${String(recipientIndex).padStart(2, "0")}`,
          status: recipientStatus,
          sentAt: recipientSentAt,
          deliveredAt,
          failedAt,
          skipReason,
          errorMessage,
        };
        await tx.campaignRecipient.upsert({
          where: { id: recipientId },
          create: { id: recipientId, ...recipientData },
          update: recipientData,
        });
        const logId = `${recipientId}-log`;
        const logData = {
          campaignId: id,
          recipientId,
          eventType: recipientStatus.toLowerCase(),
          message: "Fictional local delivery event. No notification was sent.",
        };
        await tx.campaignDeliveryLog.upsert({
          where: { id: logId },
          create: { id: logId, ...logData },
          update: logData,
        });
      }
    }
  }
}
