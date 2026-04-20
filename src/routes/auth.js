const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendEmailOTP } = require('../config/mailer');
const { verifyNMCDoctor } = require('../utils/nmcVerify');

// In-memory OTP store: email → { otp, expiresAt, userData }
const emailOtpStore = new Map();

// ── Step 1: Send OTP to email ──
router.post('/send-email-otp', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, nmcNumber, experienceYears, specialization, qualification, currentHospital } = req.body;
    if (!email || !password || !firstName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    // For doctors: validate NMC number format before sending OTP
    if ((role || 'patient') === 'doctor' && nmcNumber) {
      const nmcResult = await verifyNMCDoctor(nmcNumber, firstName, lastName || '');
      if (!nmcResult.verified) {
        return res.status(400).json({ 
          error: nmcResult.reason,
          nmcVerificationFailed: true
        });
      }
      // Flag for admin review — doctor registration will be set to 'pending'
      console.log(`Doctor signup: NMC ${nmcNumber} for ${firstName} ${lastName} — pending admin review`);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 1 * 60 * 1000; // 1 minute

    emailOtpStore.set(email, {
      otp, expiresAt, firstName, lastName, email, password, role: role || 'patient',
      nmcNumber, experienceYears, specialization, qualification, currentHospital
    });

    await sendEmailOTP(email, firstName, otp);
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Send email OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP', message: error.message });
  }
});

// ── Step 2: Verify OTP and register user ──
router.post('/verify-email-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const record = emailOtpStore.get(email);

    if (!record) return res.status(400).json({ error: 'No OTP found for this email. Please sign up again.' });
    if (Date.now() > record.expiresAt) {
      emailOtpStore.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please sign up again.' });
    }
    if (record.otp !== otp) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });

    // OTP correct — create user
    const existing = await User.findOne({ email });
    if (existing) {
      emailOtpStore.delete(email);
      return res.json({ success: true, user: { id: existing._id, firstName: existing.firstName, lastName: existing.lastName, email: existing.email, role: existing.role } });
    }

    const user = new User({
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      password: record.password,
      role: record.role,
      authMethod: 'email',
      isEmailVerified: true,
      status: 'active',
    });
    await user.save();
    emailOtpStore.delete(email);

    // If doctor, create DoctorRegistration with the extra fields
    if (record.role === 'doctor') {
      const DoctorRegistration = require('../models/DoctorRegistration');
      const doctorReg = new DoctorRegistration({
        userId: user._id,
        firstName: record.firstName,
        lastName: record.lastName,
        email: record.email,
        nmcNumber: record.nmcNumber || '',
        experienceYears: parseInt(record.experienceYears) || 0,
        specialization: record.specialization || '',
        qualification: record.qualification || '',
        currentHospital: Array.isArray(record.currentHospital) ? record.currentHospital : (record.currentHospital ? [record.currentHospital] : []),
        status: 'pending', // Admin must verify NMC at nmc.org.np before approving
      });
      await doctorReg.save();
    }

    // Issue JWT so frontend can log in immediately after OTP verification
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed', message: error.message });
  }
});

// ── Resend OTP ──
router.post('/resend-email-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const record = emailOtpStore.get(email);
    if (!record) return res.status(400).json({ error: 'No pending signup for this email. Please sign up again.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    record.otp = otp;
    record.expiresAt = Date.now() + 1 * 60 * 1000;
    emailOtpStore.set(email, record);

    await sendEmailOTP(email, record.firstName, otp);
    res.json({ success: true, message: 'New OTP sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend OTP', message: error.message });
  }
});

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
      const redirectPath = existing.role === 'doctor' ? '/doctor-dashboard' : '/register/personal';
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

    const redirectPath = payload.role === 'doctor' ? '/doctor-auth?verified=1' : '/register/personal';
    const redirectUrl = payload.role === 'doctor'
      ? `${frontendBase}/doctor-auth?verified=1&email=${encodeURIComponent(user.email)}`
      : `${frontendBase}/register/personal?verified=1&userId=${user._id}` +
        `&firstName=${encodeURIComponent(payload.firstName)}` +
        `&lastName=${encodeURIComponent(payload.lastName)}` +
        `&email=${encodeURIComponent(payload.email)}` +
        `&role=${payload.role}`;
    res.redirect(redirectUrl);
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
      isEmailVerified: true,
      status: 'active'
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

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));
