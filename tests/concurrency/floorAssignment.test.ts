import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function at(hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, 7, 30, hour, minute, 0)).toISOString();
}

async function seedFloor(tableCount = 1) {
  const { business, location } = await seedBusinessWithLocation();
  const plan = await db.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Floor",
      width: 1200,
      height: 800,
    },
  });

  const tables = [];
  for (let index = 0; index < tableCount; index += 1) {
    const table = await db.diningTable.create({
      data: {
        floorPlanId: plan.id,
        businessId: business.id,
        locationId: location.id,
        name: `Table ${index + 1}`,
        capacity: 4,
        minimumPartySize: 1,
      },
    });
    tables.push(table);
  }

  return { business, location, cookie: businessCookie(business.id), tables };
}

function countByStatus(responses: { status: number }[], status: number): number {
  return responses.filter((response) => response.status === status).length;
}

describe("concurrent table assignment", () => {
  it("lets only one of two simultaneous requests take the same table window", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();

    const payload = {
      tableId: tables[0].id,
      partySize: 4,
      source: "SMART",
      expectedStartAt: at(19),
      expectedEndAt: at(21),
    };

    const responses = await Promise.all([
      request.post(`/api/floor/${location.id}/assignments`).set("Cookie", cookie).send(payload),
      request.post(`/api/floor/${location.id}/assignments`).set("Cookie", cookie).send(payload),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);
    expect(await db.tableAssignment.count({ where: { tableId: tables[0].id } })).toBe(1);
  });

  it("lets only one of five simultaneous requests take the final table", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();

    const attempts = [];
    for (let index = 0; index < 5; index += 1) {
      attempts.push(
        request
          .post(`/api/floor/${location.id}/assignments`)
          .set("Cookie", cookie)
          .send({
            tableId: tables[0].id,
            partySize: 4,
            source: "SMART",
            expectedStartAt: at(19),
            expectedEndAt: at(21),
          }),
      );
    }

    const responses = await Promise.all(attempts);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(4);
    expect(await db.tableAssignment.count({ where: { tableId: tables[0].id } })).toBe(1);
  });

  it("rejects the second of two overlapping but different windows on one table", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments`)
        .set("Cookie", cookie)
        .send({
          tableId: tables[0].id,
          partySize: 4,
          source: "SMART",
          expectedStartAt: at(19),
          expectedEndAt: at(21),
        }),
      request
        .post(`/api/floor/${location.id}/assignments`)
        .set("Cookie", cookie)
        .send({
          tableId: tables[0].id,
          partySize: 2,
          source: "MANUAL",
          expectedStartAt: at(20),
          expectedEndAt: at(22),
        }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);
    expect(await db.tableAssignment.count({ where: { tableId: tables[0].id } })).toBe(1);
  });

  it("allows simultaneous assignments to different tables", async () => {
    const { location, cookie, tables } = await seedFloor(3);
    const request = await api();

    const responses = await Promise.all(
      tables.map((table) =>
        request
          .post(`/api/floor/${location.id}/assignments`)
          .set("Cookie", cookie)
          .send({
            tableId: table.id,
            partySize: 4,
            source: "SMART",
            expectedStartAt: at(19),
            expectedEndAt: at(21),
          }),
      ),
    );

    expect(countByStatus(responses, 201)).toBe(3);
    expect(await db.tableAssignment.count({ where: { locationId: location.id } })).toBe(3);
  });

  it("allows simultaneous back to back windows on one table", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments`)
        .set("Cookie", cookie)
        .send({
          tableId: tables[0].id,
          partySize: 4,
          source: "SMART",
          expectedStartAt: at(17),
          expectedEndAt: at(19),
        }),
      request
        .post(`/api/floor/${location.id}/assignments`)
        .set("Cookie", cookie)
        .send({
          tableId: tables[0].id,
          partySize: 4,
          source: "SMART",
          expectedStartAt: at(19),
          expectedEndAt: at(21),
        }),
    ]);

    expect(countByStatus(responses, 201)).toBe(2);
    expect(await db.tableAssignment.count({ where: { tableId: tables[0].id } })).toBe(2);
  });

  it("completes an assignment only once when two requests race", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: tables[0].id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });
    const assignmentId = created.body.assignment.id;

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
        .set("Cookie", cookie)
        .send({}),
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
        .set("Cookie", cookie)
        .send({}),
    ]);

    expect(countByStatus(responses, 200)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findUnique({ where: { id: assignmentId } });
    expect(stored?.status).toBe("COMPLETED");
  });

  it("does not let a recommendation commit after the table becomes blocked", async () => {
    const { location, cookie, tables } = await seedFloor();
    const request = await api();
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const recommendation = await request
      .get(`/api/floor/${location.id}/live`)
      .set("Cookie", cookie);
    expect(recommendation.body.waitingParties[0].recommendedTableId).toBe(tables[0].id);

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({ reason: "Out of service" });

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: tables[0].id,
        queueEntryId: guest.id,
        partySize: 2,
        source: "SMART",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });

    expect(response.status).toBe(409);
    expect(await db.tableAssignment.count({ where: { tableId: tables[0].id } })).toBe(0);
  });
});
