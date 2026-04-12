const express = require('express');
const router = express.Router();
const client = require('../config/twilio');

// Send OTP
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Check if Twilio is configured
    if (!client) {
      return res.status(503).json({ 
        error: 'SMS service not configured',
        message: 'Twilio credentials are not set up. Please configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID in .env file.'
      });
    }

    if (!process.env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(503).json({ 
        error: 'Verify service not configured',
        message: 'TWILIO_VERIFY_SERVICE_SID is not set in .env file.'
      });
    }

    // Format phone number (ensure it has country code)
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+977${phoneNumber}`;

    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: formattedNumber,
        channel: 'sms'
      });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      status: verification.status
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      error: 'Failed to send OTP',
      message: error.message
    });
  }
});

// Verify OTP
router.post('/verify', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ error: 'Phone number and code are required' });
    }

    // Check if Twilio is configured
    if (!client || !process.env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(503).json({ 
        error: 'SMS service not configured',
        message: 'Twilio is not properly configured.'
      });
    }

    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+977${phoneNumber}`;

    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: formattedNumber,
        code: code
      });

    if (verificationCheck.status === 'approved') {
      res.json({
        success: true,
        message: 'Phone number verified successfully',
        status: verificationCheck.status
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid OTP',
        status: verificationCheck.status
      });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      error: 'Failed to verify OTP',
      message: error.message
    });
  }
});

module.exports = router;
