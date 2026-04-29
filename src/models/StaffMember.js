const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'HospitalPartner', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  role: { type: String, enum: ['receptionist', 'pharmacist', 'nurse', 'lab_technician'], required: true },
  permissions: {
    viewSchedules: { type: Boolean, default: true },
    manageAppointments: { type: Boolean, default: false },
    viewMedicalRecords: { type: Boolean, default: false },
    manageBilling: { type: Boolean, default: false }
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StaffMember', staffSchema, 'StaffMembers');
