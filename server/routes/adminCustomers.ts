import express from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

const router = express.Router();

router.use(requireAdmin);

router.get("/", async (req, res) => {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  const search = req.query.search ?? "";
  const access = req.query.access ?? "all";
  const sort = req.query.sort ?? "newest";
  const rawPage = req.query.page ?? "1";
  if (
    typeof search !== "string" ||
    search.length > 200 ||
    typeof access !== "string" ||
    !["all", "trial", "paid"].includes(access) ||
    typeof sort !== "string" ||
    !["newest", "oldest", "name"].includes(sort) ||
    typeof rawPage !== "string" ||
    !/^\d+$/.test(rawPage)
  ) {
    return res.status(400).json({ error: "Invalid account filters" });
  }
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    return res.status(400).json({ error: "Invalid page" });
  }
  const pageSize = 25;
  const where: Prisma.BusinessWhereInput = {};
  const query = search.trim();
  if (query) {
    where.OR = ["name", "username", "email", "phone"].map((field) => ({
      [field]: { contains: query, mode: "insensitive" },
    }));
  }
  if (access !== "all") {
    where.trial = access === "trial";
  }
  let orderBy: Prisma.BusinessOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "asc" }];
  if (sort === "oldest") {
    orderBy = [{ createdAt: "asc" }, { id: "asc" }];
  } else if (sort === "name") {
    orderBy = [{ name: "asc" }, { id: "asc" }];
  }
  try {
    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          phone: true,
          trial: true,
          maxLocations: true,
          baseCredits: true,
          createdAt: true,
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.business.count({ where }),
    ]);
    const locationCounts = new Map<string, number>();
    if (businesses.length > 0) {
      const locations = await prisma.location.groupBy({
        by: ["businessId"],
        where: { businessId: { in: businesses.map((business) => business.id) } },
        _count: { _all: true },
      });
      for (const location of locations) {
        locationCounts.set(location.businessId, location._count._all);
      }
    }
    return res.json({
      customers: businesses.map((business) => ({
        ...business,
        locationCount: locationCounts.get(business.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    });
  } catch {
    console.error("Error fetching business accounts");
    return res.status(500).json({ error: "Unable to load business accounts" });
  }
});

export default router;
