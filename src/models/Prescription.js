const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  // Prescription Details
  medicines: [{
    name: {
      type: String,
      required: true
    },
    dosage: String, // e.g., "500mg"
    frequency: String, // e.g., "Twice daily"
    duration: String, // e.g., "7 days"
    instructions: String, // e.g., "After meals"
    quantity: Number
  }],
  diagnosis: String,
  notes: String,
  followUpDate: Date,
  tests: [String], // Recommended tests
  
  // Metadata
  checkupDate: {
    type: Date,
    default: Date.now
  },
  doctorName: String,
  patientName: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

prescriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
prescriptionSchema.index({ patientId: 1, checkupDate: -1 });
prescriptionSchema.index({ doctorId: 1, checkupDate: -1 });

module.exports = mongoose.model('Prescription', prescriptionSchema, 'Prescriptions');
