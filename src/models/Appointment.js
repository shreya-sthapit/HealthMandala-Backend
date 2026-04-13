const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Patient Information
  patientName: {
    type: String,
    required: true
  },
  patientPhone: {
    type: String
  },
  patientEmail: String,
  // Doctor Information
  doctorName: {
    type: String,
    required: true
  },
  doctorSpecialization: String,
  hospital: String,
  // Appointment Details
  appointmentDate: {
    type: Date,
    required: true
  },
  tokenNumber: {
    type: Number,
    required: true
  },
  appointmentTime: {
    type: String
  },
  appointmentType: {
    type: String,
    enum: ['consultation', 'follow-up', 'emergency', 'routine-checkup'],
    default: 'consultation'
  },
  // Reason and Symptoms
  reasonForVisit: {
    type: String,
    required: true
  },
  symptoms: String,
  // Status
  status: {
    type: String,
    enum: ['pending-admin', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no-show'],
    default: 'pending-admin'
  },
  adminApproved: {
    type: Boolean,
    default: false
  },
  adminApprovedAt: Date,
  adminApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  doctorConfirmed: {
    type: Boolean,
    default: false
  },
  doctorConfirmedAt: Date,
  // Payment
  consultationFee: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ['esewa', 'khalti', 'card', 'cash'],
    default: 'esewa'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  // Notes
  doctorNotes: String,
  patientNotes: String,
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

appointmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
appointmentSchema.index({ patientId: 1, appointmentDate: 1 });
appointmentSchema.index({ doctorId: 1, appointmentDate: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema, 'Appointments');
// Virtual: appointment status label
AppointmentSchema.virtual('statusLabel').get(function() {
  const labels = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', rejected: 'Rejected' };
  return labels[this.status] || this.status;
});
