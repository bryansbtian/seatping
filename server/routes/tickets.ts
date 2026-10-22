import express from "express";
import { prisma } from "../lib/prisma.js";
import { randomUUID } from "node:crypto";
import { queueTicketReply, serializeTicket } from "../lib/ticketMessages.js";
import { ticketInboxConfig, ticketInboxStatus } from "../lib/ticketInbox.js";
import { enqueueNotification } from "../lib/notifications.js";
import { requireAdmin } from "../lib/auth.js";

const router = express.Router();

router.use((req, res, next) => {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  next();
});
router.use(requireAdmin);
const threadInclude = { thread: { orderBy: { createdAt: "asc" as const } } };

router.get("/email/status", async (_req, res) => {
  try {
    return res.json(await ticketInboxStatus());
  } catch {
    return res.status(500).json({ error: "Unable to load email sync status" });
  }
});
router.post("/email/sync", async (_req, res) => {
  try {
    if (!ticketInboxConfig()) {
      return res.status(503).json({ error: "Email sync is not configured" });
    }
    await enqueueNotification({ type: "ticket_email_sync" });
    return res.json({ queued: true });
  } catch {
    return res.status(503).json({ error: "Unable to sync email right now" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, type, priority, limit = "50" } = req.query;

    const where: any = {};
    if (status && typeof status === "string") {
      where.status = status;
    }
    if (type && typeof type === "string") {
      where.type = type;
    }
    if (priority && typeof priority === "string") {
      where.priority = priority;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: parseInt(limit as string, 10),
      omit: { messages: true },
    });

    return res.json({
      success: true,
      tickets: tickets.map((ticket) => ({ ...ticket, messages: [] })),
    });
  } catch (error: any) {
    console.error("[tickets] Error fetching tickets:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const groups = await prisma.ticket.groupBy({
      by: ["status", "type"],
      _count: true,
    });
    const stats = { total: 0, open: 0, inProgress: 0, closed: 0, feedback: 0 };
    for (const group of groups) {
      stats.total += group._count;
      if (group.status === "open") {
        stats.open += group._count;
      } else if (group.status === "in_progress") {
        stats.inProgress += group._count;
      } else if (group.status === "closed") {
        stats.closed += group._count;
      }
      if (group.type === "feedback") {
        stats.feedback += group._count;
      }
    }
    return res.json({ success: true, stats });
  } catch (error: any) {
    console.error("[tickets] Error fetching ticket stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:ticketNumber", async (req, res) => {
  try {
    const { ticketNumber } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: threadInclude,
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error: any) {
    console.error("[tickets] Error fetching ticket:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:ticketNumber/status", express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { status } = req.body;

    if (!status || !["open", "in_progress", "closed"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Invalid status. Must be: open, in_progress, or closed" });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status },
      include: threadInclude,
    });

    console.log(`[tickets] Ticket ${ticketNumber} status updated to: ${status}`);
    return res.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error: any) {
    console.error("[tickets] Error updating ticket status:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:ticketNumber/assign", express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo || typeof assignedTo !== "string") {
      return res.status(400).json({ error: "assignedTo field is required" });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { assignedTo },
      include: threadInclude,
    });

    console.log(`[tickets] Ticket ${ticketNumber} assigned to: ${assignedTo}`);
    return res.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error: any) {
    console.error("[tickets] Error assigning ticket:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:ticketNumber/priority", express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { priority } = req.body;

    if (!priority || !["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ error: "Invalid priority. Must be: low, medium, or high" });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { priority },
      include: threadInclude,
    });

    console.log(`[tickets] Ticket ${ticketNumber} priority updated to: ${priority}`);
    return res.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error: any) {
    console.error("[tickets] Error updating ticket priority:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:ticketNumber/respond", express.json(), async (req, res) => {
  try {
    const { message, responderName, requestId = randomUUID() } = req.body;
    if (typeof message !== "string" || !message.trim() || message.length > 20000) {
      return res.status(400).json({ error: "message field is required" });
    }
    if (typeof responderName !== "string" || !responderName.trim() || responderName.length > 120) {
      return res.status(400).json({ error: "responderName field is required" });
    }
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) {
      return res.status(400).json({ error: "Invalid reply request" });
    }
    const reply = await queueTicketReply(
      req.params.ticketNumber,
      message.trim(),
      responderName.trim(),
      requestId,
    );
    if (!reply) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    if (reply.status === "PENDING") {
      await enqueueNotification({ type: "ticket_reply", messageId: reply.id });
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: req.params.ticketNumber },
      include: threadInclude,
    });
    return res.json({ success: true, message: "Reply queued", ticket: serializeTicket(ticket) });
  } catch {
    return res.status(500).json({ error: "Unable to queue this reply" });
  }
});

router.post("/:ticketNumber/messages/:id/retry", async (req, res) => {
  try {
    const message = await prisma.ticketMessage.findFirst({
      where: {
        id: req.params.id,
        ticket: { ticketNumber: req.params.ticketNumber },
        isTeamResponse: true,
      },
    });
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    const claimed = await prisma.ticketMessage.updateMany({
      where: { id: message.id, status: { in: ["FAILED", "UNKNOWN"] } },
      data: { status: "PENDING", sendStartedAt: null },
    });
    if (!claimed.count) {
      return res.status(409).json({ error: "This message is already being sent" });
    }
    await enqueueNotification({ type: "ticket_reply", messageId: message.id });
    return res.json({ queued: true });
  } catch {
    return res.status(503).json({ error: "Unable to retry this reply" });
  }
});

router.delete("/:ticketNumber", async (req, res) => {
  try {
    const { ticketNumber } = req.params;

    await prisma.ticket.delete({
      where: { ticketNumber },
      include: threadInclude,
    });

    console.log(`[tickets] Ticket ${ticketNumber} deleted`);
    return res.json({ success: true, message: "Ticket deleted successfully" });
  } catch (error: any) {
    console.error("[tickets] Error deleting ticket:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
