const mongoose = require('mongoose');

const patientRegistrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // User Info (stored directly for convenience)
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  // Personal Information
  profilePhoto: {
    type: String
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', '']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']
  },
  // Address Information
  address: {
    street: String,
    city: String,
    district: String,
    province: String
  },
  // Emergency Contact
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  // Medical Information
  medicalConditions: {
    type: String
  },
  allergies: {
    type: String
  },
  // NID Verification
  nidNumber: {
    type: String
  },
  nidFrontImage: {
    type: String
  },
  nidBackImage: {
    type: String
  },
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

patientRegistrationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PatientRegistration', patientRegistrationSchema, 'PatientRegistration');
