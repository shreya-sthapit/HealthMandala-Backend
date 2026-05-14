const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DoctorRegistration = require('../models/DoctorRegistration');

// ── Set Password (from invite link) ──────────────────────────────────────────
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });

    // Verify JWT
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Invite link expired' : 'Invalid invite link';
      return res.status(400).json({ error: msg });
    }

    const { doctorId, doctorName, hospitalName, email } = payload;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Already set up — just return login token
      const loginToken = jwt.sign({ userId: existingUser._id, role: existingUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        success: true,
        message: 'Account already exists',
        token: loginToken,
        user: { id: existingUser._id, firstName: existingUser.firstName, lastName: existingUser.lastName, email: existingUser.email, role: existingUser.role }
      });
    }

    // Verify doctor exists
    const doctor = await DoctorRegistration.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor record not found' });
    }

    // Create User account
    const nameParts = doctorName.replace(/^Dr\.\s*/i, '').split(' ');
    const firstName = nameParts[0] || 'Doctor';
    const lastName = nameParts.slice(1).join(' ') || '';

    const user = new User({
      firstName,
      lastName,
      email,
      password,
      role: 'doctor',
      authMethod: 'email',
      isEmailVerified: true,
      status: 'active'
    });
    await user.save();

    // Link user ID to doctor registration
    doctor.userId = user._id;
    await doctor.save();

    // Issue login token
    const loginToken = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Password set successfully',
      token: loginToken,
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Failed to set password', message: err.message });
  }
});

module.exports = router;
