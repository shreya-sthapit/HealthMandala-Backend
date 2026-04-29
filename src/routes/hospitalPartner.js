const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const HospitalPartner = require('../models/HospitalPartner');
const HospitalAdmin = require('../models/HospitalAdmin');
const User = require('../models/User');
const { sendHospitalInviteEmail } = require('../config/mailer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/partners/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + unique + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png|pdf/.test(path.extname(file.originalname).toLowerCase())
    && /image\/(jpeg|jpg|png)|application\/pdf/.test(file.mimetype);
  ok ? cb(null, true) : cb(new Error('Only PDF or image files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const uploadFields = upload.fields([
  { name: 'operatingLicense', maxCount: 1 },
  { name: 'companyRegCert',   maxCount: 1 },
  { name: 'taxClearance',     maxCount: 1 },
]);

router.post('/apply', uploadFields, async (req, res) => {
  try {
    const opLic  = req.files?.operatingLicense?.[0];
    const regCert = req.files?.companyRegCert?.[0];
    if (!opLic)   return res.status(400).json({ error: 'Health Facility Operating License is required' });
    if (!regCert) return res.status(400).json({ error: 'Company Registration Certificate is required' });

    const {
      hospitalName, facilityCategory, dohsLicenseNumber, panVatNumber,
      hospitalPhone, officialEmail,
      adminName, adminPhone,
      province, district, palika,
      estimatedDoctors
    } = req.body;

    const phoneRe = /^[+]?[\d\s\-().]{7,20}$/;
    if (!phoneRe.test(hospitalPhone)) return res.status(400).json({ error: 'Invalid hospital phone number' });
    if (!phoneRe.test(adminPhone))    return res.status(400).json({ error: 'Invalid admin phone number' });

    if (await HospitalPartner.findOne({ officialEmail }))
      return res.status(400).json({ error: 'An application with this email already exists' });

    const partner = new HospitalPartner({
      hospitalName, facilityCategory, dohsLicenseNumber, panVatNumber,
      hospitalPhone, officialEmail,
      adminName, adminPhone,
      province, district, palika,
      estimatedDoctors: parseInt(estimatedDoctors),
      operatingLicensePath: opLic.path,
      companyRegCertPath:   regCert.path,
      taxClearancePath:     req.files?.taxClearance?.[0]?.path || null,
    });

    await partner.save();
    res.status(201).json({ success: true, message: 'Application submitted successfully', id: partner._id });
  } catch (err) {
    console.error('Partner apply error:', err);
    res.status(500).json({ error: 'Submission failed', message: err.message });
  }
});

router.get('/status/:email', async (req, res) => {
  try {
    const p = await HospitalPartner.findOne({ officialEmail: req.params.email })
      .select('hospitalName status adminNote createdAt');
    if (!p) return res.status(404).json({ error: 'No application found for this email' });
    res.json({ success: true, application: p });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status', message: err.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    const partners = await HospitalPartner.find().sort({ createdAt: -1 });
    res.json({ success: true, partners });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch', message: err.message });
  }
});

router.put('/status/:id', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const p = await HospitalPartner.findByIdAndUpdate(req.params.id, { status, adminNote }, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });

    // When approved, generate invite token and send set-password email
    if (status === 'approved') {
      const inviteToken = jwt.sign(
        {
          hospitalId: p._id,
          hospitalName: p.hospitalName,
          adminName: p.adminName,
          officialEmail: p.officialEmail
        },
        process.env.JWT_SECRET,
        { expiresIn: '48h' }
      );
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const setPasswordUrl = `${frontendUrl}/hospital/set-password?token=${inviteToken}`;
      try {
        await sendHospitalInviteEmail(p.officialEmail, p.adminName, p.hospitalName, setPasswordUrl);
      } catch (mailErr) {
        console.error('Invite email failed:', mailErr.message);
        // Don't block the approval if email fails
      }
    }

    res.json({ success: true, partner: p });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update', message: err.message });
  }
});

// ── Resend Invite Email (for already-approved hospitals) ─────────────────────
router.post('/resend-invite/:id', async (req, res) => {
  try {
    const partner = await HospitalPartner.findById(req.params.id);
    if (!partner) return res.status(404).json({ error: 'Hospital partner not found' });
    if (partner.status !== 'approved') return res.status(400).json({ error: 'Hospital is not approved yet' });

    const inviteToken = jwt.sign(
      {
        hospitalId: partner._id,
        hospitalName: partner.hospitalName,
        adminName: partner.adminName,
        officialEmail: partner.officialEmail
      },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const setPasswordUrl = `${frontendUrl}/hospital/set-password?token=${inviteToken}`;

    await sendHospitalInviteEmail(partner.officialEmail, partner.adminName, partner.hospitalName, setPasswordUrl);

    res.json({ success: true, message: `Invite email resent to ${partner.officialEmail}`, setPasswordUrl });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Failed to resend invite', message: err.message });
  }
});

// ── Approve & Send Invite Email ──────────────────────────────────────────────
router.post('/approve/:id', async (req, res) => {
  try {
    const partner = await HospitalPartner.findById(req.params.id);
    if (!partner) return res.status(404).json({ error: 'Hospital partner not found' });
    if (partner.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    // Update status to approved
    partner.status = 'approved';
    await partner.save();

    // Generate signed JWT token (expires in 48 hours)
    const inviteToken = jwt.sign(
      {
        hospitalId: partner._id,
        hospitalName: partner.hospitalName,
        adminName: partner.adminName,
        officialEmail: partner.officialEmail
      },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    // Build set-password URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const setPasswordUrl = `${frontendUrl}/hospital/set-password?token=${inviteToken}`;

    // Send email
    await sendHospitalInviteEmail(
      partner.officialEmail,
      partner.adminName,
      partner.hospitalName,
      setPasswordUrl
    );

    res.json({
      success: true,
      message: 'Hospital approved and invite email sent',
      setPasswordUrl // Return this so admin can copy it if needed
    });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Failed to approve', message: err.message });
  }
});

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

    const { hospitalId, hospitalName, adminName, officialEmail } = payload;

    // Check if user already exists
    const existingUser = await User.findOne({ email: officialEmail });
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

    // Create User account
    const [firstName, ...lastNameParts] = adminName.split(' ');
    const user = new User({
      firstName: firstName || 'Admin',
      lastName: lastNameParts.join(' ') || '',
      email: officialEmail,
      password,
      role: 'hospital_admin',
      authMethod: 'email',
      isEmailVerified: true,
      status: 'active'
    });
    await user.save();

    // Link user to hospital
    const hospitalAdmin = new HospitalAdmin({
      userId: user._id,
      hospitalId,
      hospitalName
    });
    await hospitalAdmin.save();

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
