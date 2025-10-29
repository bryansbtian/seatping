import express from 'express';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from '../lib/email.js';
const router = express.Router();
// Get all tickets with optional filtering
router.get('/', async (req, res) => {
    try {
        const { status, type, priority, limit = '50' } = req.query;
        const where = {};
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
            take: parseInt(limit, 10),
        });
        return res.json({ success: true, tickets });
    }
    catch (error) {
        console.error('[tickets] Error fetching tickets:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Get ticket statistics
router.get('/stats', async (req, res) => {
    try {
        const [totalTickets, openTickets, inProgressTickets, closedTickets, salesTickets, feedbackTickets] = await Promise.all([
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
    }
    catch (error) {
        console.error('[tickets] Error fetching ticket stats:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Get a specific ticket by ticket number
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
    }
    catch (error) {
        console.error('[tickets] Error fetching ticket:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Update ticket status
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
    }
    catch (error) {
        console.error('[tickets] Error updating ticket status:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Assign ticket to team member
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
    }
    catch (error) {
        console.error('[tickets] Error assigning ticket:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Update ticket priority
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
    }
    catch (error) {
        console.error('[tickets] Error updating ticket priority:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Respond to a ticket (sends email to customer and updates ticket)
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
        // Get the ticket
        const ticket = await prisma.ticket.findUnique({
            where: { ticketNumber },
        });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        // Prepare email content
        const emailSubject = `Re: ${ticket.subject} [Ticket #${ticket.ticketNumber}]`;
        const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Response to Your ${ticket.type === 'sales' ? 'Inquiry' : 'Feedback'}</p>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="color: #666; margin-bottom: 10px;">Hi ${ticket.senderName},</p>

          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for reaching out to us. Here's our response to your ${ticket.type === 'sales' ? 'sales inquiry' : 'feedback'}:
          </p>

          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
            <p style="color: #333; line-height: 1.6; white-space: pre-wrap; margin: 0;">${message}</p>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 25px;">
            Best regards,<br>
            ${responderName}<br>
            SeatPing Team
          </p>

          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">

          <p style="color: #999; font-size: 12px;">
            <strong>Ticket Reference:</strong> ${ticket.ticketNumber}<br>
            <strong>Original Subject:</strong> ${ticket.subject}
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 15px;">
            You can reply directly to this email if you have any further questions.
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>© 2025 SeatPing. All rights reserved.</p>
        </div>
      </div>
    `;
        // Send email to customer
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
        // Add message to ticket
        const messages = ticket.messages;
        const updatedMessages = [
            ...messages,
            {
                sender: responderName,
                message,
                timestamp: new Date().toISOString(),
                isTeamResponse: true,
            },
        ];
        // Update ticket with new message
        const updatedTicket = await prisma.ticket.update({
            where: { ticketNumber },
            data: {
                messages: updatedMessages,
                status: 'in_progress', // Automatically set to in_progress when responded
            },
        });
        console.log(`[tickets] Ticket ${ticketNumber} updated with response`);
        return res.json({
            success: true,
            message: 'Response sent successfully',
            ticket: updatedTicket,
        });
    }
    catch (error) {
        console.error('[tickets] Error responding to ticket:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete a ticket
router.delete('/:ticketNumber', async (req, res) => {
    try {
        const { ticketNumber } = req.params;
        await prisma.ticket.delete({
            where: { ticketNumber },
        });
        console.log(`[tickets] Ticket ${ticketNumber} deleted`);
        return res.json({ success: true, message: 'Ticket deleted successfully' });
    }
    catch (error) {
        console.error('[tickets] Error deleting ticket:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
