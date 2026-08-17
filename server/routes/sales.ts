import express from 'express';
import { sendSalesInquiryEmail, sendSalesInquiryConfirmationEmail, SalesInquiryData } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';
import { generateTicketNumber } from '../lib/tickets.js';
import { limitGuard, clientIp, HOURS } from '../lib/rateLimit.js';

const router = express.Router();

router.post('/inquiry', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const data: SalesInquiryData = {
      businessName: String(body.businessName || "").trim(),
      businessEmail: String(body.businessEmail || "").trim(),
      contactName: String(body.contactName || "").trim(),
      phoneNumber: String(body.phoneNumber || "").trim(),
    };

    if (
      await limitGuard(req, res, [
        { name: 'sales-ip', key: clientIp(req), windowMs: HOURS(1), max: 10 },
        { name: 'sales-email', key: data.businessEmail.toLowerCase(), windowMs: HOURS(1), max: 3 },
      ])
    )
      {
        return;
      }

    if (!data.businessName || !data.businessEmail || !data.contactName || !data.phoneNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.businessEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const emailSent = await sendSalesInquiryEmail(data);
    if (!emailSent) {
      console.error('[sales] Failed to send sales inquiry email');
      return res.status(500).json({ error: 'Failed to send inquiry email' });
    }

    const ticketNumber = await generateTicketNumber('SALES');
    const subject = `New Sales Inquiry From ${data.businessName}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        type: 'sales',
        status: 'open',
        subject,
        senderName: data.contactName,
        senderEmail: data.businessEmail,
        senderPhone: data.phoneNumber,
        businessName: data.businessName,
        data: data as any,
        messages: [
          {
            sender: data.contactName,
            message: `Demo request from ${data.businessName} (${data.contactName}, ${data.businessEmail}, ${data.phoneNumber}).`,
            timestamp: new Date().toISOString(),
            isTeamResponse: false,
          },
        ],
      },
    });

    const confirmationSent = await sendSalesInquiryConfirmationEmail(
      data.businessEmail,
      data.contactName,
      data.businessName,
      ticket.ticketNumber
    );
    if (!confirmationSent) {
      console.error('[sales] Failed to send confirmation email to user');
    }

    return res.json({
      success: true,
      message: 'Sales inquiry submitted successfully',
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error: any) {
    console.error('[sales] Error processing sales inquiry:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
