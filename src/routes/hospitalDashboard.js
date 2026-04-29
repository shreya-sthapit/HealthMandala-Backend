const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const HospitalPartner = require('../models/HospitalPartner');
const HospitalAdmin = require('../models/HospitalAdmin');
const DoctorRegistration = require('../models/DoctorRegistration');
const Appointment = require('../models/Appointment');
const Department = require('../models/Department');
const StaffMember = require('../models/StaffMember');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Helper: get hospitalId from userId
async function getHospitalId(userId) {
  const admin = await HospitalAdmin.findOne({ userId });
  return admin ? admin.hospitalId : null;
}

// ── Overview / Stats ─────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const [todayApts, pendingApts, checkedIn, weekApts, doctors, departments, staff] = await Promise.all([
      Appointment.countDocuments({ hospital: hospitalName, appointmentDate: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ hospital: hospitalName, status: 'pending-admin' }),
      Appointment.countDocuments({ hospital: hospitalName, appointmentDate: { $gte: today, $lt: tomorrow }, status: 'confirmed' }),
      Appointment.find({ hospital: hospitalName, appointmentDate: { $gte: weekStart }, status: { $ne: 'cancelled' } }).select('consultationFee paymentStatus'),
      DoctorRegistration.find({ currentHospital: hospitalName, status: 'approved' }).select('firstName lastName specialization availableDays availableTimeStart availableTimeEnd consultationFee leaves'),
      Department.countDocuments({ hospitalId }),
      StaffMember.countDocuments({ hospitalId, status: 'active' })
    ]);

    const todayRevenue = weekApts
      .filter(a => new Date(a.appointmentDate) >= today && a.paymentStatus === 'paid')
      .reduce((s, a) => s + (a.consultationFee || 0), 0);
    const weekRevenue = weekApts
      .filter(a => a.paymentStatus === 'paid')
      .reduce((s, a) => s + (a.consultationFee || 0), 0);

    // Doctor availability today
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const onDuty = doctors.filter(d => (d.availableDays || []).includes(dayName));
    const onLeave = doctors.filter(d =>
      (d.leaves || []).some(l => today >= new Date(l.startDate) && today <= new Date(l.endDate))
    );

    res.json({
      success: true,
      stats: {
        todayAppointments: todayApts,
        pendingRequests: pendingApts,
        checkedIn,
        totalDoctors: doctors.length,
        doctorsOnDuty: onDuty.length,
        doctorsOnLeave: onLeave.length,
        departments,
        activeStaff: staff,
        todayRevenue,
        weekRevenue
      },
      hospital: { id: hospitalId, name: hospitalName, ...hospital?.toObject() }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
  }
});

// ── Appointments ─────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/appointments
router.get('/appointments', async (req, res) => {
  try {
    const { userId, date, status, doctorId, search } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const filter = { hospital: hospitalName };
    if (status && status !== 'all') filter.status = status;
    if (date) {
      const d = new Date(date); d.setHours(0,0,0,0);
      const d2 = new Date(d); d2.setDate(d2.getDate()+1);
      filter.appointmentDate = { $gte: d, $lt: d2 };
    }
    if (doctorId) filter.doctorId = doctorId;
    if (search) filter.$or = [
      { patientName: { $regex: search, $options: 'i' } },
      { doctorName: { $regex: search, $options: 'i' } }
    ];

    const appointments = await Appointment.find(filter).sort({ appointmentDate: 1, appointmentTime: 1 }).limit(200);
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments', message: err.message });
  }
});

// PUT /api/hospital-dashboard/appointments/:id/status
router.put('/appointments/:id/status', async (req, res) => {
  try {
    const { status, userId } = req.body;
    const apt = await Appointment.findByIdAndUpdate(req.params.id, { status, updatedAt: Date.now() }, { new: true });
    if (!apt) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ success: true, appointment: apt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update', message: err.message });
  }
});

// POST /api/hospital-dashboard/appointments/walk-in
router.post('/appointments/walk-in', async (req, res) => {
  try {
    const { userId, patientName, patientPhone, doctorId, doctorName, appointmentDate, appointmentTime, reasonForVisit, consultationFee } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);

    // Get next token for this doctor+date
    const d = new Date(appointmentDate); d.setHours(0,0,0,0);
    const d2 = new Date(d); d2.setDate(d2.getDate()+1);
    const count = await Appointment.countDocuments({ doctorId, appointmentDate: { $gte: d, $lt: d2 } });

    const apt = new Appointment({
      patientName, patientPhone,
      doctorId, doctorName,
      hospital: hospital?.hospitalName,
      appointmentDate, appointmentTime,
      reasonForVisit, consultationFee: consultationFee || 0,
      tokenNumber: count + 1,
      status: 'confirmed',
      adminApproved: true,
      paymentMethod: 'cash'
    });
    await apt.save();
    res.status(201).json({ success: true, appointment: apt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create walk-in', message: err.message });
  }
});

// ── Doctors ───────────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/doctors
router.get('/doctors', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const doctors = await DoctorRegistration.find({ currentHospital: hospitalName }).select('-nidFrontImage -nidBackImage -nmcCertificateImage -degreeCertificateImage');
    res.json({ success: true, doctors });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch doctors', message: err.message });
  }
});

// POST /api/hospital-dashboard/doctors/add
router.post('/doctors/add', async (req, res) => {
  try {
    const { userId, nmcNumber, specialization, consultationFee, schedule, firstName, lastName, phone, email, qualification, yearsOfExperience, signature } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    // Check if doctor with NMC already exists
    let doctor = await DoctorRegistration.findOne({ nmcNumber });
    if (doctor) {
      // Add this hospital to their list if not already there
      if (!doctor.currentHospital.includes(hospitalName)) {
        doctor.currentHospital.push(hospitalName);
      }
      // Add hospital schedule
      const existingScheduleIdx = doctor.hospitalSchedules?.findIndex(s => s.hospital === hospitalName);
      if (existingScheduleIdx === -1 || existingScheduleIdx === undefined) {
        if (!doctor.hospitalSchedules) doctor.hospitalSchedules = [];
        doctor.hospitalSchedules.push({ hospital: hospitalName, schedule: schedule || [] });
      }
      await doctor.save();
      return res.json({ success: true, doctor, message: 'Doctor linked to hospital' });
    }

    // Create new doctor registration
    doctor = new DoctorRegistration({
      firstName, lastName, phone, email,
      nmcNumber, specialization,
      qualification,
      experienceYears: yearsOfExperience ? parseInt(yearsOfExperience) : undefined,
      signature: signature || '',
      consultationFee: parseFloat(consultationFee) || 0,
      currentHospital: [hospitalName],
      hospitalSchedules: [{ hospital: hospitalName, schedule: schedule || [] }],
      status: 'pending'
    });
    await doctor.save();
    res.status(201).json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add doctor', message: err.message });
  }
});

// PUT /api/hospital-dashboard/doctors/:id
router.put('/doctors/:id', async (req, res) => {
  try {
    const { consultationFee, schedule, hospitalName, leaves, firstName, lastName, phone, email, specialization, qualification, yearsOfExperience, signature, departmentId } = req.body;
    const doctor = await DoctorRegistration.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    if (firstName !== undefined) doctor.firstName = firstName;
    if (lastName !== undefined) doctor.lastName = lastName;
    if (phone !== undefined) doctor.phone = phone;
    if (email !== undefined) doctor.email = email;
    if (specialization !== undefined) doctor.specialization = specialization;
    if (qualification !== undefined) doctor.qualification = qualification;
    if (yearsOfExperience !== undefined) doctor.experienceYears = yearsOfExperience;
    if (signature !== undefined) doctor.signature = signature;
    if (consultationFee !== undefined) doctor.consultationFee = consultationFee;
    if (leaves) doctor.leaves = leaves;

    // Handle department change: remove from all depts, add to new one
    if (departmentId !== undefined) {
      const hospitalId = await getHospitalId(req.body.userId || req.query.userId);
      if (hospitalId) {
        await Department.updateMany({ hospitalId }, { $pull: { doctors: doctor._id } });
        if (departmentId) {
          await Department.findByIdAndUpdate(departmentId, { $addToSet: { doctors: doctor._id } });
        }
      }
    }

    if (schedule && hospitalName) {
      const idx = (doctor.hospitalSchedules || []).findIndex(
        s => s.hospital?.trim().toLowerCase() === hospitalName.trim().toLowerCase()
      );
      if (idx >= 0) doctor.hospitalSchedules[idx].schedule = schedule;
      else {
        if (!doctor.hospitalSchedules) doctor.hospitalSchedules = [];
        doctor.hospitalSchedules.push({ hospital: hospitalName, schedule });
      }
    }
    await doctor.save();
    res.json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update doctor', message: err.message });
  }
});

// DELETE /api/hospital-dashboard/doctors/:id
router.delete('/doctors/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const doctor = await DoctorRegistration.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Remove hospital from doctor's list rather than deleting the doctor record
    doctor.currentHospital = doctor.currentHospital.filter(h => h !== hospitalName);
    doctor.hospitalSchedules = (doctor.hospitalSchedules || []).filter(s => s.hospital !== hospitalName);
    await doctor.save();

    // Remove doctor from all departments in this hospital
    await Department.updateMany(
      { hospitalId },
      { $pull: { doctors: doctor._id } }
    );

    // Also clean up any string-form references
    const depts = await Department.find({ hospitalId });
    for (const dept of depts) {
      const before = dept.doctors.length;
      dept.doctors = dept.doctors.filter(id => id.toString() !== doctor._id.toString());
      if (dept.doctors.length !== before) await dept.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove doctor', message: err.message });
  }
});

// ── Departments ───────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/departments
router.get('/departments', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const departments = await Department.find({ hospitalId }).populate('doctors', 'firstName lastName specialization');

    // Clean up stale doctor references (doctors that no longer exist or were removed from hospital)
    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';
    for (const dept of departments) {
      const validDoctors = dept.doctors.filter(d => d !== null && d.currentHospital?.includes(hospitalName));
      if (validDoctors.length !== dept.doctors.length) {
        await Department.findByIdAndUpdate(dept._id, { doctors: validDoctors.map(d => d._id) });
      }
    }

    const cleanDepts = await Department.find({ hospitalId }).populate('doctors', 'firstName lastName specialization');
    res.json({ success: true, departments: cleanDepts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch departments', message: err.message });
  }
});

// POST /api/hospital-dashboard/departments
router.post('/departments', async (req, res) => {
  try {
    const { userId, name, description, opdTimings } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const dept = new Department({ hospitalId, name, description, opdTimings });
    await dept.save();
    res.status(201).json({ success: true, department: dept });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create department', message: err.message });
  }
});

// PUT /api/hospital-dashboard/departments/:id
router.put('/departments/:id', async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true, department: dept });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update department', message: err.message });
  }
});

// DELETE /api/hospital-dashboard/departments/:id
router.delete('/departments/:id', async (req, res) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete department', message: err.message });
  }
});

// ── Staff ─────────────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/staff
router.get('/staff', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const staff = await StaffMember.find({ hospitalId });
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff', message: err.message });
  }
});

// POST /api/hospital-dashboard/staff
router.post('/staff', async (req, res) => {
  try {
    const { userId, name, email, phone, role, permissions } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const staff = new StaffMember({ hospitalId, name, email, phone, role, permissions });
    await staff.save();
    res.status(201).json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add staff', message: err.message });
  }
});

// PUT /api/hospital-dashboard/staff/:id
router.put('/staff/:id', async (req, res) => {
  try {
    const staff = await StaffMember.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update staff', message: err.message });
  }
});

// DELETE /api/hospital-dashboard/staff/:id
router.delete('/staff/:id', async (req, res) => {
  try {
    await StaffMember.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete staff', message: err.message });
  }
});

// ── Patients ──────────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/patients
router.get('/patients', async (req, res) => {
  try {
    const { userId, search } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const filter = { hospital: hospitalName };
    if (search) filter.$or = [
      { patientName: { $regex: search, $options: 'i' } },
      { patientPhone: { $regex: search, $options: 'i' } }
    ];

    const appointments = await Appointment.find(filter)
      .select('patientId patientName patientPhone patientEmail appointmentDate doctorName status')
      .sort({ appointmentDate: -1 });

    // Deduplicate by patientName+phone
    const seen = new Set();
    const patients = [];
    for (const a of appointments) {
      const key = `${a.patientName}-${a.patientPhone}`;
      if (!seen.has(key)) {
        seen.add(key);
        patients.push({
          patientId: a.patientId,
          name: a.patientName,
          phone: a.patientPhone,
          email: a.patientEmail,
          lastVisit: a.appointmentDate,
          lastDoctor: a.doctorName
        });
      }
    }
    res.json({ success: true, patients });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch patients', message: err.message });
  }
});

// ── Hospital Profile ──────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/profile
router.get('/profile', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ success: true, hospital });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile', message: err.message });
  }
});

// PUT /api/hospital-dashboard/profile
router.put('/profile', async (req, res) => {
  try {
    const { userId, ...updates } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findByIdAndUpdate(hospitalId, { ...updates, updatedAt: Date.now() }, { new: true });
    res.json({ success: true, hospital });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', message: err.message });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────

// GET /api/hospital-dashboard/reports
router.get('/reports', async (req, res) => {
  try {
    const { userId, period = 'week' } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    const now = new Date();
    let startDate = new Date();
    if (period === 'week') startDate.setDate(now.getDate() - 7);
    else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'year') startDate.setFullYear(now.getFullYear() - 1);

    const appointments = await Appointment.find({
      hospital: hospitalName,
      appointmentDate: { $gte: startDate }
    }).select('doctorName doctorSpecialization status consultationFee paymentStatus appointmentDate');

    // Doctor-wise stats
    const doctorMap = {};
    for (const a of appointments) {
      if (!doctorMap[a.doctorName]) doctorMap[a.doctorName] = { name: a.doctorName, specialization: a.doctorSpecialization, count: 0, revenue: 0 };
      doctorMap[a.doctorName].count++;
      if (a.paymentStatus === 'paid') doctorMap[a.doctorName].revenue += (a.consultationFee || 0);
    }

    const totalRevenue = appointments.filter(a => a.paymentStatus === 'paid').reduce((s, a) => s + (a.consultationFee || 0), 0);
    const statusBreakdown = appointments.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

    res.json({
      success: true,
      reports: {
        totalAppointments: appointments.length,
        totalRevenue,
        statusBreakdown,
        doctorStats: Object.values(doctorMap).sort((a, b) => b.count - a.count)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports', message: err.message });
  }
});

// ── Admin Setup (invite link) ─────────────────────────────────────────────────

// POST /api/hospital-dashboard/setup-admin  (called by super admin to link a user to a hospital)
router.post('/setup-admin', async (req, res) => {
  try {
    const { userId, hospitalId, hospitalName } = req.body;
    const existing = await HospitalAdmin.findOne({ userId });
    if (existing) return res.json({ success: true, message: 'Already linked' });

    const ha = new HospitalAdmin({ userId, hospitalId, hospitalName });
    await ha.save();

    // Update user role
    await User.findByIdAndUpdate(userId, { role: 'hospital_admin' });

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to setup admin', message: err.message });
  }
});

module.exports = router;
