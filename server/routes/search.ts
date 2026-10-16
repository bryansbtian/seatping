import { Router } from "express";
import { limitGuard, clientIp, MINUTES } from "../lib/rateLimit.js";
import { restaurantSearchOptions, searchRestaurants } from "../lib/restaurantSearch.js";

const router = Router();

router.get("/restaurants", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "search-restaurants-ip", key: clientIp(req), windowMs: MINUTES(1), max: 60 },
      ])
    ) {
      return;
    }
    return res.json(await searchRestaurants(restaurantSearchOptions(req.query)));
  } catch {
    console.error("[search] Failed to load restaurants.");
    return res.status(500).json({ error: "Search failed." });
  }
});

export default router;
