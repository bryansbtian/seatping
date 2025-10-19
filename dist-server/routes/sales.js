import express from 'express';
import { sendSalesInquiryEmail } from '../lib/email';
const router = express.Router();
router.post('/inquiry', express.json(), async (req, res) => {
    try {
        console.log('[sales] Received sales inquiry:', req.body);
        const data = req.body;
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
        if (emailSent) {
            console.log('[sales] ✅ Sales inquiry email sent successfully');
            return res.json({ success: true, message: 'Sales inquiry submitted successfully' });
        }
        else {
            console.error('[sales] ❌ Failed to send sales inquiry email');
            return res.status(500).json({ error: 'Failed to send inquiry email' });
        }
    }
    catch (error) {
        console.error('[sales] ❌ Error processing sales inquiry:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
