const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'HospitalPartner', required: true },
  name: { type: String, required: true },
  description: String,
  opdTimings: { open: String, close: String },
  doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DoctorRegistration' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Department', departmentSchema, 'Departments');
