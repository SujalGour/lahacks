import { Router } from 'express';

const router = Router();

// POST /sms — sends SMS via Twilio or logs to console if not configured
router.post('/', async (req, res, next) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && fromNumber) {
      // Real Twilio send
      const twilio = require('twilio')(accountSid, authToken);
      await twilio.messages.create({
        body: message,
        from: fromNumber,
        to
      });
      res.json({ success: true, mode: 'twilio' });
    } else {
      // Console stub for demo
      console.log(`[SMS STUB] To: ${to} | Message: ${message}`);
      res.json({ success: true, mode: 'stub', to, message });
    }
  } catch (err) {
    next(err);
  }
});

export default router;