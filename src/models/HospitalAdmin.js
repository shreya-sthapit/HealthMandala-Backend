const mongoose = require('mongoose');

// Tracks which User accounts are hospital admins and which hospital they manage
const hospitalAdminSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'HospitalPartner', required: true },
  hospitalName: { type: String, required: true },
  inviteToken: { type: String },
  inviteUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HospitalAdmin', hospitalAdminSchema, 'HospitalAdmins');
