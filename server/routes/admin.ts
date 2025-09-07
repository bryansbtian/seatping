import express from "express";
import { prisma } from "../lib/prisma";

const router = express.Router();

// Update business credits
router.post("/update-credits", async (req, res) => {
  try {
    const { username, baseCustomerCredits, baseSMSCredits } = req.body;

    // Validate input
    if (!username || baseCustomerCredits === undefined || baseSMSCredits === undefined) {
      return res.status(400).send("Missing required fields");
    }

    if (typeof baseCustomerCredits !== 'number' || typeof baseSMSCredits !== 'number') {
      return res.status(400).send("Credits must be numbers");
    }

    if (baseCustomerCredits < 0 || baseSMSCredits < 0) {
      return res.status(400).send("Credits cannot be negative");
    }

    // Find and update the user
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      return res.status(404).send("Business user not found");
    }

    const updatedUser = await prisma.user.update({
      where: { username },
      data: {
        baseCustomerCredits,
        baseSMSCredits,
        updatedAt: new Date()
      }
    });

    res.json({
      message: "Credits updated successfully",
      user: {
        username: updatedUser.username,
        baseCustomerCredits: updatedUser.baseCustomerCredits,
        baseSMSCredits: updatedUser.baseSMSCredits
      }
    });

  } catch (error) {
    console.error("Error updating credits:", error);
    res.status(500).send("Internal server error");
  }
});

export default router;

