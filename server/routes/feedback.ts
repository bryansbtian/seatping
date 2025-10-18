import express from 'express';
import { sendFeedbackEmail, FeedbackData } from '../lib/email';

const router = express.Router();

router.post('/submit', express.json(), async (req, res) => {
  try {
    console.log('[feedback] Received feedback submission:', req.body);

    const data: FeedbackData = req.body;

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

    if (emailSent) {
      console.log('[feedback] ✅ Feedback email sent successfully');
      return res.json({ success: true, message: 'Feedback submitted successfully' });
    } else {
      console.error('[feedback] ❌ Failed to send feedback email');
      return res.status(500).json({ error: 'Failed to send feedback email' });
    }
  } catch (error: any) {
    console.error('[feedback] ❌ Error processing feedback:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
