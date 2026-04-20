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

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

hospitalPartnerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('HospitalPartner', hospitalPartnerSchema, 'HospitalPartners');
