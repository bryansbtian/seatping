import express from "express";
import { sendFeedbackEmail, sendFeedbackConfirmationEmail, FeedbackData } from "../lib/email.js";
import { prisma } from "../lib/prisma.js";
import { generateTicketNumber } from "../lib/tickets.js";
import { limitGuard, clientIp, HOURS } from "../lib/rateLimit.js";

const router = express.Router();

router.post("/submit", express.json(), async (req, res) => {
  try {
    const data: FeedbackData = req.body;

    const senderEmail = String(data?.email || "")
      .toLowerCase()
      .trim();
    if (
      await limitGuard(req, res, [
        { name: "feedback-ip", key: clientIp(req), windowMs: HOURS(1), max: 10 },
        { name: "feedback-email", key: senderEmail, windowMs: HOURS(1), max: 3 },
      ])
    ) {
      return;
    }

    if (!data.name || !data.email || !data.subject || !data.message || !data.feedbackType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const emailSent = await sendFeedbackEmail(data);
    if (!emailSent) {
      console.error("[feedback] Failed to send feedback email");
      return res.status(500).json({ error: "Failed to send feedback email" });
    }

    const ticketNumber = await generateTicketNumber("FEEDBACK");

    let priority = data.severity;
    if (!priority) {
      if (data.feedbackType === "bug") {
        priority = "medium";
      } else {
        priority = "low";
      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        type: "feedback",
        status: "open",
        priority,
        subject: data.subject,
        senderName: data.name,
        senderEmail: data.email,
        senderPhone: data.phone,
        businessName: data.businessName,
        data: data as any,
        messages: [
          {
            sender: data.name,
            message: data.message,
            timestamp: new Date().toISOString(),
            isTeamResponse: false,
          },
        ],
      },
    });

    const confirmationSent = await sendFeedbackConfirmationEmail(
      data.email,
      data.name,
      ticket.ticketNumber,
      data.subject,
    );
    if (!confirmationSent) {
      console.error("[feedback] Failed to send confirmation email to user");
    }

    return res.json({
      success: true,
      message: "Feedback submitted successfully",
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error: any) {
    console.error("[feedback] Error processing feedback:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
