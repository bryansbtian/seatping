import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const savedAudienceFindMany = vi.fn();
const savedAudienceFindFirst = vi.fn();
const savedAudienceCreate = vi.fn();
const savedAudienceUpdate = vi.fn();
const savedAudienceDelete = vi.fn();
const businessFindUnique = vi.fn();
const resolveAudienceGuests = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      savedAudience: {
        findMany: savedAudienceFindMany,
        findFirst: savedAudienceFindFirst,
        create: savedAudienceCreate,
        update: savedAudienceUpdate,
        delete: savedAudienceDelete,
      },
      business: { findUnique: businessFindUnique },
    },
  };
});

vi.mock("../../server/lib/campaigns.js", () => {
  return { resolveAudienceGuests };
});

const audiencesRouter = (await import("../../server/routes/audiences.js")).default;

const ORIGINAL_ENV = { ...process.env };

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/api/audiences", audiencesRouter);
  return supertest(server);
}

function cookie(businessId = "biz-1"): string {
  const token = signJwt({ sub: businessId, accountType: "business" });
  return `sp_auth_business=${token}`;
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "aud-1",
    businessId: "biz-1",
    locationId: "loc-1",
    name: "Regulars",
    description: "Frequent guests",
    filters: { minVisits: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  savedAudienceFindMany.mockReset().mockResolvedValue([]);
  savedAudienceFindFirst.mockReset().mockResolvedValue(existing());
  savedAudienceCreate.mockReset().mockImplementation(async ({ data }) => {
    return { id: "aud-new", ...data };
  });
  savedAudienceUpdate.mockReset().mockImplementation(async ({ data }) => {
    return { id: "aud-1", ...data };
  });
  savedAudienceDelete.mockReset().mockResolvedValue({});
  businessFindUnique.mockReset().mockResolvedValue({ id: "biz-1", username: "bistro" });
  resolveAudienceGuests.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("audience listing", () => {
  it("refuses an anonymous caller", async () => {
    const res = await app().get("/api/audiences?locationId=loc-1");

    expect(res.status).toBe(401);
  });

  it("scopes the query to the business and location", async () => {
    await app().get("/api/audiences?locationId=loc-1").set("Cookie", cookie());

    expect(savedAudienceFindMany.mock.calls[0][0].where).toEqual({
      businessId: "biz-1",
      locationId: "loc-1",
    });
  });

  it("reports a server error without leaking the cause", async () => {
    savedAudienceFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/audiences?locationId=loc-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Server error" });
  });

  it("survives a rejection that carries no message", async () => {
    savedAudienceFindMany.mockRejectedValue("db exploded");

    const res = await app().get("/api/audiences?locationId=loc-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect((console.error as any).mock.calls[0][1]).toBe("db exploded");
  });
});

describe("creating an audience", () => {
  it("rejects a name that is not a string", async () => {
    const res = await app()
      .post("/api/audiences")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1", name: 7 });

    expect(res.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/api/audiences")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1", name: "Regulars" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Business not found");
  });

  it("trims the description when one is given", async () => {
    const res = await app()
      .post("/api/audiences")
      .set("Cookie", cookie())
      .send({
        locationId: "loc-1",
        name: "Regulars",
        description: "  Frequent guests  ",
        filters: { minVisits: 3 },
      });

    expect(res.status).toBe(200);
    expect(res.body.audience.description).toBe("Frequent guests");
    expect(res.body.audience.filters).toEqual({ minVisits: 3 });
    expect(res.body.audience.businessUsername).toBe("bistro");
  });

  it("reports a failed write", async () => {
    savedAudienceCreate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/audiences")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1", name: "Regulars" });

    expect(res.status).toBe(500);
  });
});

describe("previewing an audience", () => {
  it("defaults the timezone when none is given", async () => {
    await app()
      .post("/api/audiences/preview")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1", filters: {} });

    expect(resolveAudienceGuests.mock.calls[0][0].timezone).toBe("UTC");
  });

  it("passes a supplied timezone through", async () => {
    await app()
      .post("/api/audiences/preview")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1", filters: {}, timezone: "Asia/Jakarta" });

    expect(resolveAudienceGuests.mock.calls[0][0].timezone).toBe("Asia/Jakarta");
  });

  it("builds a full name from the parts when there is no stored one", async () => {
    resolveAudienceGuests.mockResolvedValue([
      {
        id: "g1",
        fullName: null,
        firstName: "Ada",
        lastName: "Lovelace",
        totalVisits: 4,
        tags: [],
      },
      {
        id: "g2",
        fullName: null,
        firstName: null,
        lastName: null,
        totalVisits: 1,
        tags: [],
      },
    ]);

    const res = await app()
      .post("/api/audiences/preview")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1" });

    expect(res.body.guests[0].fullName).toBe("Ada Lovelace");
    expect(res.body.guests[0].returning).toBe(true);
    expect(res.body.guests[1].fullName).toBeNull();
    expect(res.body.guests[1].returning).toBe(false);
  });

  it("caps the preview at one hundred guests but reports the full count", async () => {
    resolveAudienceGuests.mockResolvedValue(
      Array.from({ length: 130 }, (_, i) => {
        return { id: `g${i}`, fullName: `Guest ${i}`, totalVisits: 1, tags: [] };
      }),
    );

    const res = await app()
      .post("/api/audiences/preview")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1" });

    expect(res.body.count).toBe(130);
    expect(res.body.guests).toHaveLength(100);
  });

  it("reports a failed preview", async () => {
    resolveAudienceGuests.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/audiences/preview")
      .set("Cookie", cookie())
      .send({ locationId: "loc-1" });

    expect(res.status).toBe(500);
  });
});

describe("updating an audience", () => {
  it("keeps every field when the body is empty", async () => {
    const res = await app().patch("/api/audiences/aud-1").set("Cookie", cookie()).send({});

    expect(res.status).toBe(200);
    expect(savedAudienceUpdate.mock.calls[0][0].data).toEqual({
      name: "Regulars",
      description: "Frequent guests",
      filters: { minVisits: 2 },
    });
  });

  it("ignores a name that is not a string", async () => {
    await app().patch("/api/audiences/aud-1").set("Cookie", cookie()).send({ name: 7 });

    expect(savedAudienceUpdate.mock.calls[0][0].data.name).toBe("Regulars");
  });

  it("trims a new description and clears an empty one", async () => {
    await app()
      .patch("/api/audiences/aud-1")
      .set("Cookie", cookie())
      .send({ description: "  Weekend guests  " });
    expect(savedAudienceUpdate.mock.calls[0][0].data.description).toBe("Weekend guests");

    savedAudienceUpdate.mockClear();
    await app().patch("/api/audiences/aud-1").set("Cookie", cookie()).send({ description: null });
    expect(savedAudienceUpdate.mock.calls[0][0].data.description).toBeNull();
  });

  it("reports an unknown audience", async () => {
    savedAudienceFindFirst.mockResolvedValue(null);

    const res = await app()
      .patch("/api/audiences/aud-1")
      .set("Cookie", cookie())
      .send({ name: "Renamed" });

    expect(res.status).toBe(404);
  });

  it("reports a failed write", async () => {
    savedAudienceUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .patch("/api/audiences/aud-1")
      .set("Cookie", cookie())
      .send({ name: "Renamed" });

    expect(res.status).toBe(500);
  });
});

describe("deleting an audience", () => {
  it("scopes the lookup to the caller's business", async () => {
    await app().delete("/api/audiences/aud-1").set("Cookie", cookie());

    expect(savedAudienceFindFirst.mock.calls[0][0].where).toEqual({
      id: "aud-1",
      businessId: "biz-1",
    });
    expect(savedAudienceDelete).toHaveBeenCalledWith({
      where: { id: "aud-1" },
    });
  });

  it("reports an unknown audience", async () => {
    savedAudienceFindFirst.mockResolvedValue(null);

    const res = await app().delete("/api/audiences/aud-1").set("Cookie", cookie());

    expect(res.status).toBe(404);
    expect(savedAudienceDelete).not.toHaveBeenCalled();
  });

  it("reports a failed delete", async () => {
    savedAudienceDelete.mockRejectedValue(new Error("db down"));

    const res = await app().delete("/api/audiences/aud-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });
});
