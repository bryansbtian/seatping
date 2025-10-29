import express from 'express';
import { sendSalesInquiryEmail, sendSalesInquiryConfirmationEmail, SalesInquiryData } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// Helper function to generate unique ticket number
const generateTicketNumber = async (type: 'SALES' | 'FEEDBACK'): Promise<string> => {
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

router.post('/inquiry', express.json(), async (req, res) => {
  try {
    console.log('[sales] Received sales inquiry:', req.body);

    const data: SalesInquiryData = req.body;

    // Basic validation
    if (!data.businessName || !data.contactName || !data.workEmail || !data.subject || !data.message) {
      console.error('[sales] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.workEmail)) {
      console.error('[sales] Invalid email format');
      return res.status(400).json({ error: 'Invalid email format' });
    }

    console.log('[sales] Sending sales inquiry email...');
    const emailSent = await sendSalesInquiryEmail(data);

    if (!emailSent) {
      console.error('[sales] ❌ Failed to send sales inquiry email');
      return res.status(500).json({ error: 'Failed to send inquiry email' });
    }

    console.log('[sales] ✅ Sales inquiry email sent successfully');

    // Create ticket in database
    console.log('[sales] Creating ticket...');
    const ticketNumber = await generateTicketNumber('SALES');

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        type: 'sales',
        status: 'open',
        subject: data.subject,
        senderName: data.contactName,
        senderEmail: data.workEmail,
        senderPhone: data.phone,
        businessName: data.businessName,
        data: data as any,
        messages: [
          {
            sender: data.contactName,
            message: data.message,
            timestamp: new Date().toISOString(),
            isTeamResponse: false,
          },
        ],
      },
    });

    console.log('[sales] ✅ Ticket created:', ticket.ticketNumber);

    // Send confirmation email to user
    console.log('[sales] Sending confirmation email to user...');
    const confirmationSent = await sendSalesInquiryConfirmationEmail(
      data.workEmail,
      data.contactName,
      ticket.ticketNumber,
      data.subject
    );

    if (confirmationSent) {
      console.log('[sales] ✅ Confirmation email sent to user');
    } else {
      console.error('[sales] ⚠️ Failed to send confirmation email to user');
      // Note: We don't fail the request if confirmation email fails
    }

    return res.json({
      success: true,
      message: 'Sales inquiry submitted successfully',
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error: any) {
    console.error('[sales] ❌ Error processing sales inquiry:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
