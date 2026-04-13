const mongoose = require('mongoose');

const doctorRegistrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  // Personal Information
  profilePhoto: String,
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['male', 'female', 'other', '']
  },
  // Professional Information
  specialization: String,
  nmcNumber: String, // Nepal Medical Council Registration Number
  qualification: String,
  experienceYears: Number,
  currentHospital: String,
  consultationFee: Number,
  // Address Information
  address: {
    street: String,
    city: String,
    district: String,
    province: String
  },
  // Availability
  availableDays: [String],
  availableTimeStart: String,
  availableTimeEnd: String,
  // Detailed Schedule
  schedule: [{
    day: String,
    start: String,
    end: String,
    active: Boolean
  }],
  lunchBreak: {
    start: String,
    end: String
  },
  consultationDuration: {
    type: Number,
    default: 30
  },
  maxPatientsPerDay: {
    type: Number,
    default: 20
  },
  leaves: [{
    startDate: Date,
    endDate: Date,
    reason: String
  }],
  // Documents
  nmcCertificateImage: String,
  degreeCertificateImage: String,
  // NID Verification
  nidNumber: String,
  nidFrontImage: String,
  nidBackImage: String,
  // Bio
  bio: String,
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

doctorRegistrationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual: full name
doctorRegistrationSchema.virtual('fullName').get(function() {
  return `Dr. ${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('DoctorRegistration', doctorRegistrationSchema, 'DoctorRegistration');
