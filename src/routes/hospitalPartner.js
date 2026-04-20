const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const HospitalPartner = require('../models/HospitalPartner');

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
      province, district,
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
      province, district,
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
    res.json({ success: true, partner: p });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update', message: err.message });
  }
});

module.exports = router;
