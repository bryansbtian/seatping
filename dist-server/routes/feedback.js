import express from 'express';
import { sendFeedbackEmail, sendFeedbackConfirmationEmail } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';
const router = express.Router();
// Helper function to generate unique ticket number
const generateTicketNumber = async (type) => {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    // Get count of tickets created today for this type
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    const count = await prisma.ticket.count({
        where: {
            type: type.toLowerCase(),
            createdAt: {
                gte: startOfDay,
                lte: endOfDay,
            },
        },
    });
    const ticketNum = String(count + 1).padStart(4, '0');
    return `${type}-${dateStr}-${ticketNum}`;
};
router.post('/submit', express.json(), async (req, res) => {
    try {
        console.log('[feedback] Received feedback submission:', req.body);
        const data = req.body;
        // Basic validation
        if (!data.name || !data.email || !data.subject || !data.message || !data.feedbackType) {
            console.error('[feedback] Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            console.error('[feedback] Invalid email format');
            return res.status(400).json({ error: 'Invalid email format' });
        }
        console.log('[feedback] Sending feedback email...');
        const emailSent = await sendFeedbackEmail(data);
        if (!emailSent) {
            console.error('[feedback] ❌ Failed to send feedback email');
            return res.status(500).json({ error: 'Failed to send feedback email' });
        }
        console.log('[feedback] ✅ Feedback email sent successfully');
        // Create ticket in database
        console.log('[feedback] Creating ticket...');
        const ticketNumber = await generateTicketNumber('FEEDBACK');
        // Determine priority based on severity (if provided)
        const priority = data.severity || (data.feedbackType === 'bug' ? 'medium' : 'low');
        const ticket = await prisma.ticket.create({
            data: {
                ticketNumber,
                type: 'feedback',
                status: 'open',
                priority,
                subject: data.subject,
                senderName: data.name,
                senderEmail: data.email,
                senderPhone: data.phone,
                businessName: data.businessName,
                data: data,
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
        console.log('[feedback] ✅ Ticket created:', ticket.ticketNumber);
        // Send confirmation email to user
        console.log('[feedback] Sending confirmation email to user...');
        const confirmationSent = await sendFeedbackConfirmationEmail(data.email, data.name, ticket.ticketNumber, data.subject);
        if (confirmationSent) {
            console.log('[feedback] ✅ Confirmation email sent to user');
        }
        else {
            console.error('[feedback] ⚠️ Failed to send confirmation email to user');
            // Note: We don't fail the request if confirmation email fails
        }
        return res.json({
            success: true,
            message: 'Feedback submitted successfully',
            ticketNumber: ticket.ticketNumber,
        });
    }
    catch (error) {
        console.error('[feedback] ❌ Error processing feedback:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
