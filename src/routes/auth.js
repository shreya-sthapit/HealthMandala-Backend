const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationEmail } = require('../config/mailer');

const EMAIL_VERIFY_SECRET = process.env.JWT_SECRET + '_email_verify';

// ── Step 1: Send verification email ──
router.post('/send-verification', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // JWT token — payload carries all registration data, expires in 24h
    const token = jwt.sign(
      { firstName, lastName, email, password, role: role || 'patient' },
      EMAIL_VERIFY_SECRET,
      { expiresIn: '24h' }
    );

    await sendVerificationEmail(email, firstName, token);
    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email', message: error.message });
  }
});

// ── Step 2: Verify token (user clicks link in email) ──
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!token) {
    return res.redirect(`${frontendBase}/verify-email?status=invalid`);
  }

  let payload;
  try {
    payload = jwt.verify(token, EMAIL_VERIFY_SECRET);
  } catch (err) {
    const status = err.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    return res.redirect(`${frontendBase}/verify-email?status=${status}`);
  }

  try {
    // Idempotent — if already registered just redirect to success
    const existing = await User.findOne({ email: payload.email });
    if (existing) {
      const redirectPath = existing.role === 'doctor' ? '/doctor-register/personal' : '/register/personal';
      return res.redirect(
        `${frontendBase}${redirectPath}?verified=1&userId=${existing._id}` +
        `&firstName=${encodeURIComponent(existing.firstName)}` +
        `&lastName=${encodeURIComponent(existing.lastName)}` +
        `&email=${encodeURIComponent(existing.email)}` +
        `&role=${existing.role}`
      );
    }

    const user = new User({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      authMethod: 'email',
      isEmailVerified: true,
      status: 'active',
    });
    await user.save();

    const redirectPath = payload.role === 'doctor' ? '/doctor-register/personal' : '/register/personal';
    res.redirect(
      `${frontendBase}${redirectPath}?verified=1&userId=${user._id}` +
      `&firstName=${encodeURIComponent(payload.firstName)}` +
      `&lastName=${encodeURIComponent(payload.lastName)}` +
      `&email=${encodeURIComponent(payload.email)}` +
      `&role=${payload.role}`
    );
  } catch (error) {
    console.error('Verify email error:', error);
    res.redirect(`${frontendBase}/verify-email?status=error`);
  }
});

// ── Resend verification email ──
router.post('/resend-verification', async (req, res) => {
  try {
    const { email, firstName, lastName, password, role } = req.body;

    // Re-issue a fresh JWT token
    const token = jwt.sign(
      { firstName, lastName, email, password, role: role || 'patient' },
      EMAIL_VERIFY_SECRET,
      { expiresIn: '24h' }
    );

    await sendVerificationEmail(email, firstName || 'there', token);
    res.json({ success: true, message: 'Verification email resent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend', message: error.message });
  }
});

// Register with Email
router.post('/register/email', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, firebaseUid } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      role: role || 'patient',
      authMethod: 'email',
      firebaseUid,
      isEmailVerified: false,
      status: 'pending'
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

// Register with Phone
router.post('/register/phone', async (req, res) => {
  try {
    const { firstName, lastName, phone, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      phone,
      password,
      role: role || 'patient',
      authMethod: 'phone',
      isPhoneVerified: true,
      status: 'pending'
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Find user by email or phone
    let user;
    if (email) {
      user = await User.findOne({ email });
    } else if (phone) {
      user = await User.findOne({ phone });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Only block suspended accounts, allow pending accounts to login
    if (user.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Account suspended',
        status: 'suspended'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// Get user by ID
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

// Update email verification status
router.put('/verify-email/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isEmailVerified: true },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update', message: error.message });
  }
});

module.exports = router;
