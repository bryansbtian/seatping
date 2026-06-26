import express from 'express';
import { prisma } from '../lib/prisma.js';
import { sendEmail, renderEmail, p, calloutBox, esc } from '../lib/email.js';
import { requireAdmin } from '../lib/auth.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { status, type, priority, limit = '50' } = req.query;

    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (type && typeof type === 'string') {
      where.type = type;
    }
    if (priority && typeof priority === 'string') {
      where.priority = priority;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit as string, 10),
    });

    return res.json({ success: true, tickets });
  } catch (error: any) {
    console.error('[tickets] Error fetching tickets:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [totalTickets, openTickets, inProgressTickets, closedTickets, salesTickets, feedbackTickets] =
      await Promise.all([
        prisma.ticket.count(),
        prisma.ticket.count({ where: { status: 'open' } }),
        prisma.ticket.count({ where: { status: 'in_progress' } }),
        prisma.ticket.count({ where: { status: 'closed' } }),
        prisma.ticket.count({ where: { type: 'sales' } }),
        prisma.ticket.count({ where: { type: 'feedback' } }),
      ]);

    return res.json({
      success: true,
      stats: {
        total: totalTickets,
        open: openTickets,
        inProgress: inProgressTickets,
        closed: closedTickets,
        sales: salesTickets,
        feedback: feedbackTickets,
      },
    });
  } catch (error: any) {
    console.error('[tickets] Error fetching ticket stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:ticketNumber', async (req, res) => {
  try {
    const { ticketNumber } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.json({ success: true, ticket });
  } catch (error: any) {
    console.error('[tickets] Error fetching ticket:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:ticketNumber/status', express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { status } = req.body;

    if (!status || !['open', 'in_progress', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: open, in_progress, or closed' });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status },
    });

    console.log(`[tickets] Ticket ${ticketNumber} status updated to: ${status}`);
    return res.json({ success: true, ticket });
  } catch (error: any) {
    console.error('[tickets] Error updating ticket status:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:ticketNumber/assign', express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo || typeof assignedTo !== 'string') {
      return res.status(400).json({ error: 'assignedTo field is required' });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { assignedTo },
    });

    console.log(`[tickets] Ticket ${ticketNumber} assigned to: ${assignedTo}`);
    return res.json({ success: true, ticket });
  } catch (error: any) {
    console.error('[tickets] Error assigning ticket:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:ticketNumber/priority', express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { priority } = req.body;

    if (!priority || !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be: low, medium, or high' });
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { priority },
    });

    console.log(`[tickets] Ticket ${ticketNumber} priority updated to: ${priority}`);
    return res.json({ success: true, ticket });
  } catch (error: any) {
    console.error('[tickets] Error updating ticket priority:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:ticketNumber/respond', express.json(), async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { message, responderName } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message field is required' });
    }

    if (!responderName || typeof responderName !== 'string') {
      return res.status(400).json({ error: 'responderName field is required' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const kind = ticket.type === 'sales' ? 'sales inquiry' : 'feedback';
    const kindTitle = ticket.type === 'sales' ? 'Sales Inquiry' : 'Feedback';
    const emailSubject = `Re: ${ticket.subject} [Ticket #${ticket.ticketNumber}]`;
    const emailHtml = renderEmail({
      heading: `Response To Your ${kindTitle}`,
      preheader: `We've Replied To Your ${kindTitle}`,
      bodyHtml: `
        ${p(`Hi ${esc(ticket.senderName)}, thanks for reaching out. Here's our response to your ${kind}:`)}
        ${calloutBox(esc(message).replace(/\n/g, '<br>'))}
        ${p(`Best regards,<br>${esc(responderName)}<br>The SeatPing team`)}
        ${p(`<span style="font-size: 13px; color: #64748B;"><strong>Ticket:</strong> ${esc(ticket.ticketNumber)} · <strong>Subject:</strong> ${esc(ticket.subject)}<br>You can reply directly to this email with any follow-up questions.</span>`)}
      `,
    });

    console.log(`[tickets] Sending response email for ticket ${ticketNumber}`);
    const emailSent = await sendEmail({
      to: ticket.senderEmail,
      subject: emailSubject,
      html: emailHtml,
      from: 'bryan.susanto@seatping.biz',
    });

    if (!emailSent) {
      console.error('[tickets] Failed to send response email');
      return res.status(500).json({ error: 'Failed to send response email' });
    }

    console.log('[tickets] Response email sent successfully');

    const messages = ticket.messages as any[];
    const updatedMessages = [
      ...messages,
      {
        sender: responderName,
        message,
        timestamp: new Date().toISOString(),
        isTeamResponse: true,
      },
    ];

    const updatedTicket = await prisma.ticket.update({
      where: { ticketNumber },
      data: {
        messages: updatedMessages,
        status: 'in_progress',
      },
    });

    console.log(`[tickets] Ticket ${ticketNumber} updated with response`);
    return res.json({
      success: true,
      message: 'Response sent successfully',
      ticket: updatedTicket,
    });
  } catch (error: any) {
    console.error('[tickets] Error responding to ticket:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:ticketNumber', async (req, res) => {
  try {
    const { ticketNumber } = req.params;

    await prisma.ticket.delete({
      where: { ticketNumber },
    });

    console.log(`[tickets] Ticket ${ticketNumber} deleted`);
    return res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error: any) {
    console.error('[tickets] Error deleting ticket:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
