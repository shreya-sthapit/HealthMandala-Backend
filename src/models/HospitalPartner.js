const mongoose = require('mongoose');

const hospitalPartnerSchema = new mongoose.Schema({
  // 1. Facility & Legal Identity
  hospitalName:      { type: String, required: true },
  facilityCategory:  { type: String, required: true },
  dohsLicenseNumber: { type: String, required: true },
  panVatNumber:      { type: String, required: true },

  // 2. Contact Information
  hospitalPhone: { type: String, required: true },
  officialEmail: { type: String, required: true, unique: true },

  // 3. Administrative Contact
  adminName:  { type: String, required: true },
  adminPhone: { type: String, required: true },

  // 4. Location
  province: { type: String, required: true },
  district: { type: String, required: true },
  palika:   { type: String, required: true },

  // 5. Basic Info
  estimatedDoctors: { type: Number, required: true },

  // 6. Documents
  operatingLicensePath: { type: String, required: true },
  companyRegCertPath:   { type: String, required: true },
  taxClearancePath:     { type: String },

  // Status
  status: {
    type: String,
    enum: ['under_review', 'approved', 'rejected'],
    default: 'under_review'
  },
  adminNote: { type: String },
  inviteEmailSent: { type: Boolean, default: false },

  // Extended profile fields (set by hospital admin)
  website: { type: String },
  googleMapsUrl: { type: String },
  khaltiMerchantId: { type: String },
  esewaId: { type: String },
  opdTimings: { open: String, close: String },
  logoUrl: { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

hospitalPartnerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Fire invite email whenever status is set to 'approved' via any update
hospitalPartnerSchema.post('findOneAndUpdate', async function (doc) {
  try {
    if (!doc || doc.status !== 'approved') return;

    // Only send if not already sent (track with inviteEmailSent flag)
    if (doc.inviteEmailSent) return;

    const jwt = require('jsonwebtoken');
    const { sendHospitalInviteEmail } = require('../config/mailer');

    const inviteToken = jwt.sign(
      {
        hospitalId: doc._id,
        hospitalName: doc.hospitalName,
        adminName: doc.adminName,
        officialEmail: doc.officialEmail
      },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const setPasswordUrl = `${frontendUrl}/hospital/set-password?token=${inviteToken}`;

    await sendHospitalInviteEmail(doc.officialEmail, doc.adminName, doc.hospitalName, setPasswordUrl);

    // Mark email as sent so it doesn't fire again on subsequent updates
    await doc.constructor.findByIdAndUpdate(doc._id, { inviteEmailSent: true });

    console.log(`✅ Invite email sent to ${doc.officialEmail}`);
  } catch (err) {
    console.error('❌ Invite email hook failed:', err.message);
  }
});

module.exports = mongoose.model('HospitalPartner', hospitalPartnerSchema, 'HospitalPartners');
