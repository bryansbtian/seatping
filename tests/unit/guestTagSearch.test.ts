import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return { prisma: { $queryRaw: queryRaw } };
});

const { findGuestProfileIdsByExactTag, findGuestProfileIdsByTagSearch } =
  await import("../../server/lib/guestTagSearch.js");

function boundValues(callIndex = 0): unknown[] {
  return queryRaw.mock.calls[callIndex].slice(1);
}

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([]);
});

describe("findGuestProfileIdsByExactTag", () => {
  it("returns the ids the query matched", async () => {
    queryRaw.mockResolvedValue([{ id: "g-1" }, { id: "g-2" }]);

    await expect(findGuestProfileIdsByExactTag("biz-1", "loc-1", "VIP")).resolves.toEqual([
      "g-1",
      "g-2",
    ]);
  });

  it("binds the scope and the trimmed tag as parameters", async () => {
    await findGuestProfileIdsByExactTag("biz-1", "loc-1", "  VIP  ");

    expect(boundValues()).toEqual(["biz-1", "loc-1", "VIP"]);
  });

  it("never queries for a blank tag", async () => {
    await expect(findGuestProfileIdsByExactTag("biz-1", "loc-1", "   ")).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("passes a tag carrying sql wildcards through untouched", async () => {
    await findGuestProfileIdsByExactTag("biz-1", "loc-1", "100%_off");

    expect(boundValues()).toEqual(["biz-1", "loc-1", "100%_off"]);
  });
});

describe("findGuestProfileIdsByTagSearch", () => {
  it("returns the ids the query matched", async () => {
    queryRaw.mockResolvedValue([{ id: "g-9" }]);

    await expect(findGuestProfileIdsByTagSearch("biz-1", "loc-1", "vip")).resolves.toEqual(["g-9"]);
  });

  it("binds the scope and the trimmed term as parameters", async () => {
    await findGuestProfileIdsByTagSearch("biz-1", "loc-1", "  vip  ");

    expect(boundValues()).toEqual(["biz-1", "loc-1", "vip"]);
  });

  it("never queries for a blank term", async () => {
    await expect(findGuestProfileIdsByTagSearch("biz-1", "loc-1", "")).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("treats a term carrying sql wildcards as literal text", async () => {
    await findGuestProfileIdsByTagSearch("biz-1", "loc-1", "50%_off");

    expect(boundValues()).toEqual(["biz-1", "loc-1", "50%_off"]);
  });

  it("keeps the caller term out of the sql it interpolates", async () => {
    await findGuestProfileIdsByTagSearch("biz-1", "loc-1", "'; DROP TABLE guest_profiles; --");

    const sqlFragments = queryRaw.mock.calls[0][0] as string[];
    expect(sqlFragments.join("")).not.toContain("DROP TABLE");
  });
});
