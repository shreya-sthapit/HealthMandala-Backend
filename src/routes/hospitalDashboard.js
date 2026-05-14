const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const HospitalPartner = require('../models/HospitalPartner');
const HospitalAdmin = require('../models/HospitalAdmin');
const DoctorRegistration = require('../models/DoctorRegistration');
const Appointment = require('../models/Appointment');
const Department = require('../models/Department');
const StaffMember = require('../models/StaffMember');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendDoctorInviteEmail, sendStaffInviteEmail } = require('../config/mailer');
const uploadConfigs = require('../config/multer');

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

// Helper: escape regex special chars
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper: check if two time ranges overlap
function timeRangesOverlap(start1, end1, start2, end2) {
  const toMinutes = (timeStr) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    } catch (e) {
      console.error('Invalid time format:', timeStr);
      return 0;
    }
  };
  
  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);
  
  return (s1 < e2) && (s2 < e1);
}

// Helper: check for schedule conflicts across hospitals
function checkScheduleConflict(existingSchedules, newSchedule) {
  if (!existingSchedules || existingSchedules.length === 0) return null;
  if (!newSchedule || newSchedule.length === 0) return null;
  
  for (const newEntry of newSchedule) {
    if (!newEntry.active) continue;
    
    const newDay = newEntry.day;
    const newStart = newEntry.start;
    const newEnd = newEntry.end;
    
    for (const hospitalSchedule of existingSchedules) {
      const hospitalName = hospitalSchedule.hospital;
      const existingSchedule = hospitalSchedule.schedule || [];
      
      for (const existingEntry of existingSchedule) {
        if (!existingEntry.active) continue;
        
        if (existingEntry.day === newDay) {
          const existingStart = existingEntry.start;
          const existingEnd = existingEntry.end;
          
          if (timeRangesOverlap(newStart, newEnd, existingStart, existingEnd)) {
            return {
              conflictingHospital: hospitalName,
              day: newDay,
              existingStart,
              existingEnd,
              newStart,
              newEnd
            };
          }
        }
      }
    }
  }
  
  return null;
}

// GET /api/hospital-dashboard/doctors
router.get('/doctors', async (req, res) => {
  try {
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    // Fetch doctors from both sources for redundancy
    // Method 1: From DoctorRegistration where managedByHospitals includes this hospital
    const doctorsFromReg = await DoctorRegistration.find({ managedByHospitals: hospitalId })
      .select('-nidFrontImage -nidBackImage -nmcCertificateImage -degreeCertificateImage');
    
    // Method 2: From HospitalPartner's doctors array (populate)
    const hospital = await HospitalPartner.findById(hospitalId).populate({
      path: 'doctors',
      select: '-nidFrontImage -nidBackImage -nmcCertificateImage -degreeCertificateImage'
    });
    
    // Merge and deduplicate by _id
    const doctorMap = new Map();
    doctorsFromReg.forEach(d => doctorMap.set(d._id.toString(), d));
    (hospital?.doctors || []).forEach(d => {
      if (d) doctorMap.set(d._id.toString(), d);
    });
    
    const doctors = Array.from(doctorMap.values());
    res.json({ success: true, doctors });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch doctors', message: err.message });
  }
});

// POST /api/hospital-dashboard/doctors/add
router.post('/doctors/add', async (req, res) => {
  try {
    const { userId, nmcNumber, specialization, consultationFee, schedule,
            firstName, lastName, phone, email, qualification, yearsOfExperience, signature } = req.body;

    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    // Check if doctor with this NMC already managed by this hospital
    let doctor = await DoctorRegistration.findOne({ nmcNumber, managedByHospitals: hospitalId });
    if (doctor) {
      return res.status(400).json({ error: 'A doctor with this NMC number is already added to your hospital' });
    }

    // Check if NMC exists in another hospital — link them
    doctor = await DoctorRegistration.findOne({ nmcNumber });
    let isNewDoctor = false;
    
    if (doctor) {
      // Check for schedule conflicts before adding
      console.log(`Checking schedule conflicts for Dr. ${firstName} ${lastName} (NMC: ${nmcNumber})`);
      console.log(`Existing hospitals: ${(doctor.hospitalSchedules || []).map(h => h.hospital).join(', ')}`);
      
      const conflict = checkScheduleConflict(doctor.hospitalSchedules, schedule);
      if (conflict) {
        console.log(`Schedule conflict detected for Dr. ${firstName} ${lastName}:`, conflict);
        return res.status(400).json({
          success: false,
          error: `Schedule conflict detected: Dr. ${firstName} ${lastName} already works at ${conflict.conflictingHospital} on ${conflict.day} from ${conflict.existingStart}-${conflict.existingEnd}. Cannot add schedule for ${conflict.newStart}-${conflict.newEnd}.`,
          conflict: {
            doctorName: `Dr. ${firstName} ${lastName}`,
            conflictingHospital: conflict.conflictingHospital,
            day: conflict.day,
            existingTimeRange: `${conflict.existingStart}-${conflict.existingEnd}`,
            newTimeRange: `${conflict.newStart}-${conflict.newEnd}`
          }
        });
      }
      
      console.log(`No conflicts found. Adding Dr. ${firstName} ${lastName} to ${hospitalName}`);
      
      if (!doctor.managedByHospitals) doctor.managedByHospitals = [];
      doctor.managedByHospitals.push(hospitalId);
      if (!doctor.currentHospital.includes(hospitalName)) doctor.currentHospital.push(hospitalName);
      if (!doctor.hospitalSchedules) doctor.hospitalSchedules = [];
      const hasSchedule = doctor.hospitalSchedules.some(s => s.hospital?.trim().toLowerCase() === hospitalName.trim().toLowerCase());
      if (!hasSchedule) doctor.hospitalSchedules.push({ hospital: hospitalName, schedule: schedule || [] });
      await doctor.save();

      // Add doctor to hospital's doctors array
      await HospitalPartner.findByIdAndUpdate(hospitalId, { $addToSet: { doctors: doctor._id } });
    } else {
      // Create new doctor
      isNewDoctor = true;
      doctor = new DoctorRegistration({
        firstName, lastName, phone, email,
        nmcNumber, specialization, qualification,
        experienceYears: yearsOfExperience !== '' && yearsOfExperience != null ? parseInt(yearsOfExperience) : undefined,
        signature: signature || '',
        consultationFee: parseFloat(consultationFee) || 0,
        managedByHospitals: [hospitalId],
        currentHospital: [hospitalName],
        hospitalSchedules: [{ hospital: hospitalName, schedule: schedule || [] }],
        status: 'approved',
      });
      await doctor.save();

      // Add doctor to hospital's doctors array
      await HospitalPartner.findByIdAndUpdate(hospitalId, { $addToSet: { doctors: doctor._id } });
    }

    // Send invitation email only for NEW doctors
    if (isNewDoctor && email) {
      try {
        const inviteToken = jwt.sign(
          {
            doctorId: doctor._id,
            doctorName: `${firstName} ${lastName}`,
            hospitalName: hospitalName,
            email: email
          },
          process.env.JWT_SECRET,
          { expiresIn: '48h' }
        );

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const setPasswordUrl = `${frontendUrl}/doctor/set-password?token=${inviteToken}`;

        await sendDoctorInviteEmail(email, `${firstName} ${lastName}`, hospitalName, setPasswordUrl);
        console.log(`✅ Invitation email sent to ${email}`);
      } catch (emailErr) {
        console.error('❌ Failed to send invitation email:', emailErr.message);
        // Don't fail the request if email fails - doctor is already added
      }
    }

    // Auto-link to matching department by specialization
    if (specialization) {
      // Try exact match first (case-insensitive)
      let dept = await Department.findOne({
        hospitalId,
        name: { $regex: new RegExp(`^${escapeRegex(specialization)}\\s*\\(`, 'i') }
      });
      
      // If no match with parentheses, try exact name match
      if (!dept) {
        dept = await Department.findOne({
          hospitalId,
          name: { $regex: new RegExp(`^${escapeRegex(specialization)}$`, 'i') }
        });
      }
      
      if (dept) {
        console.log(`Auto-linking doctor to department: ${dept.name}`);
        await Department.findByIdAndUpdate(dept._id, { $addToSet: { doctors: doctor._id } });
      } else {
        console.log(`No matching department found for specialization: ${specialization}`);
        console.log(`Available departments:`, await Department.find({ hospitalId }).select('name'));
      }
    }

    res.status(201).json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add doctor', message: err.message });
  }
});

// PUT /api/hospital-dashboard/doctors/:id
router.put('/doctors/:id', async (req, res) => {
  try {
    const { consultationFee, schedule, hospitalName, leaves,
            firstName, lastName, phone, email, specialization,
            qualification, yearsOfExperience, signature, userId } = req.body;

    const doctor = await DoctorRegistration.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    if (firstName  !== undefined) doctor.firstName  = firstName;
    if (lastName   !== undefined) doctor.lastName   = lastName;
    if (phone      !== undefined) doctor.phone      = phone;
    if (email      !== undefined) doctor.email      = email;
    if (specialization !== undefined) doctor.specialization = specialization;
    if (qualification  !== undefined) doctor.qualification  = qualification;
    if (yearsOfExperience !== undefined) doctor.experienceYears = yearsOfExperience !== '' ? parseInt(yearsOfExperience) : undefined;
    if (signature  !== undefined) doctor.signature  = signature;
    if (consultationFee !== undefined) doctor.consultationFee = parseFloat(consultationFee);
    if (leaves) doctor.leaves = leaves;

    // Update hospital-specific schedule
    if (schedule && hospitalName) {
      if (!doctor.hospitalSchedules) doctor.hospitalSchedules = [];
      const idx = doctor.hospitalSchedules.findIndex(
        s => s.hospital?.trim().toLowerCase() === hospitalName.trim().toLowerCase()
      );
      if (idx >= 0) doctor.hospitalSchedules[idx].schedule = schedule;
      else doctor.hospitalSchedules.push({ hospital: hospitalName, schedule });
    }

    await doctor.save();

    // Re-link to department based on updated specialization
    if (specialization !== undefined && userId) {
      const hospitalId = await getHospitalId(userId);
      if (hospitalId) {
        await Department.updateMany({ hospitalId }, { $pull: { doctors: doctor._id } });
        const dept = await Department.findOne({
          hospitalId,
          name: { $regex: new RegExp(`^${escapeRegex(specialization)}`, 'i') }
        });
        if (dept) await Department.findByIdAndUpdate(dept._id, { $addToSet: { doctors: doctor._id } });
      }
    }

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

    const doctor = await DoctorRegistration.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    console.log(`Removing doctor ${doctor.firstName} ${doctor.lastName} from hospital ${hospitalName}`);

    // Remove this hospital from the doctor's managed list
    doctor.managedByHospitals = (doctor.managedByHospitals || []).filter(id => id.toString() !== hospitalId.toString());
    doctor.currentHospital = doctor.currentHospital.filter(h => h !== hospitalName);
    doctor.hospitalSchedules = (doctor.hospitalSchedules || []).filter(s => s.hospital?.trim().toLowerCase() !== hospitalName.trim().toLowerCase());
    
    // Check if doctor has any other hospitals
    const hasOtherHospitals = doctor.managedByHospitals.length > 0;
    
    if (hasOtherHospitals) {
      // Doctor works at other hospitals - just update the document
      await doctor.save();
      console.log(`Doctor still works at ${doctor.managedByHospitals.length} other hospital(s) - updated references`);
    } else {
      // Doctor has no other hospitals - delete completely from database
      await DoctorRegistration.findByIdAndDelete(doctor._id);
      console.log(`Doctor has no other hospitals - deleted from DoctorRegistration collection`);
    }

    // Remove from hospital's doctors array
    await HospitalPartner.findByIdAndUpdate(hospitalId, { $pull: { doctors: doctor._id } });
    console.log(`Removed doctor from hospital's doctors array`);

    // Remove from all departments in this hospital
    const deptResult = await Department.updateMany({ hospitalId }, { $pull: { doctors: doctor._id } });
    console.log(`Removed doctor from ${deptResult.modifiedCount} departments`);

    res.json({ 
      success: true, 
      message: hasOtherHospitals 
        ? 'Doctor removed from your hospital successfully' 
        : 'Doctor removed from your hospital and deleted from system (no other hospitals)'
    });
  } catch (err) {
    console.error('Error removing doctor:', err);
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

    const departments = await Department.find({ hospitalId }).populate('doctors', 'firstName lastName specialization currentHospital managedByHospitals');

    // Clean up stale doctor references (doctors that no longer exist or were removed from hospital)
    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';
    
    for (const dept of departments) {
      const validDoctors = dept.doctors.filter(d => {
        if (!d) return false;
        // Check if doctor is managed by this hospital (by ID)
        const managedByThisHospital = d.managedByHospitals?.some(hId => hId.toString() === hospitalId.toString());
        return managedByThisHospital;
      });
      
      if (validDoctors.length !== dept.doctors.length) {
        console.log(`Cleaning up department ${dept.name}: ${dept.doctors.length} -> ${validDoctors.length} doctors`);
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

    // Fetch staff from both sources for redundancy
    // Method 1: From StaffMember where managedByHospitals includes this hospital
    const staffFromReg = await StaffMember.find({ managedByHospitals: hospitalId });
    
    // Method 2: From HospitalPartner's staff array (populate)
    const hospital = await HospitalPartner.findById(hospitalId).populate('staff');
    
    // Merge and deduplicate by _id
    const staffMap = new Map();
    staffFromReg.forEach(s => staffMap.set(s._id.toString(), s));
    (hospital?.staff || []).forEach(s => {
      if (s) staffMap.set(s._id.toString(), s);
    });
    
    const staff = Array.from(staffMap.values());
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

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    // Check if staff with this email already exists at this hospital
    let staff = await StaffMember.findOne({ email, managedByHospitals: hospitalId });
    if (staff) {
      return res.status(400).json({ error: 'A staff member with this email is already added to your hospital' });
    }

    // Check if staff exists at another hospital
    staff = await StaffMember.findOne({ email });
    let isNewStaff = false;
    
    if (staff) {
      // Link to this hospital
      if (!staff.managedByHospitals) staff.managedByHospitals = [];
      staff.managedByHospitals.push(hospitalId);
      if (!staff.currentHospital.includes(hospitalName)) staff.currentHospital.push(hospitalName);
      await staff.save();

      // Add to hospital's staff array
      await HospitalPartner.findByIdAndUpdate(hospitalId, { $addToSet: { staff: staff._id } });
      
      console.log(`Linked existing staff ${name} to ${hospitalName}`);
    } else {
      // Create new staff member
      isNewStaff = true;
      staff = new StaffMember({ 
        hospitalId, 
        managedByHospitals: [hospitalId],
        currentHospital: [hospitalName],
        name, 
        email, 
        phone, 
        role, 
        permissions 
      });
      await staff.save();

      // Add to hospital's staff array
      await HospitalPartner.findByIdAndUpdate(hospitalId, { $addToSet: { staff: staff._id } });
      
      console.log(`Created new staff ${name} at ${hospitalName}`);
    }

    // Send invitation email only for NEW staff
    if (isNewStaff && email) {
      try {
        const inviteToken = jwt.sign(
          {
            staffId: staff._id,
            staffName: name,
            hospitalName: hospitalName,
            role: role,
            email: email
          },
          process.env.JWT_SECRET,
          { expiresIn: '48h' }
        );

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const setPasswordUrl = `${frontendUrl}/staff/set-password?token=${inviteToken}`;

        await sendStaffInviteEmail(email, name, hospitalName, role, setPasswordUrl);
        console.log(`✅ Invitation email sent to ${email}`);
      } catch (emailErr) {
        console.error('❌ Failed to send invitation email:', emailErr.message);
        // Don't fail the request if email fails - staff is already added
      }
    }

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
    const { userId } = req.query;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    const staff = await StaffMember.findById(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const hospital = await HospitalPartner.findById(hospitalId);
    const hospitalName = hospital?.hospitalName || '';

    console.log(`Removing staff ${staff.name} from hospital ${hospitalName}`);

    // Remove this hospital from the staff's managed list
    staff.managedByHospitals = (staff.managedByHospitals || []).filter(id => id.toString() !== hospitalId.toString());
    staff.currentHospital = staff.currentHospital.filter(h => h !== hospitalName);
    
    // Check if staff has any other hospitals
    const hasOtherHospitals = staff.managedByHospitals.length > 0;
    
    if (hasOtherHospitals) {
      // Staff works at other hospitals - just update the document
      await staff.save();
      console.log(`Staff still works at ${staff.managedByHospitals.length} other hospital(s) - updated references`);
    } else {
      // Staff has no other hospitals - delete completely from database
      await StaffMember.findByIdAndDelete(staff._id);
      console.log(`Staff has no other hospitals - deleted from StaffMember collection`);
    }

    // Remove from hospital's staff array
    await HospitalPartner.findByIdAndUpdate(hospitalId, { $pull: { staff: staff._id } });
    console.log(`Removed staff from hospital's staff array`);

    res.json({ 
      success: true, 
      message: hasOtherHospitals 
        ? 'Staff removed from your hospital successfully' 
        : 'Staff removed from your hospital and deleted from system (no other hospitals)'
    });
  } catch (err) {
    console.error('Error removing staff:', err);
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

// POST /api/hospital-dashboard/profile/logo
router.post('/profile/logo', uploadConfigs.single('logo'), async (req, res) => {
  try {
    const { userId } = req.body;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(403).json({ error: 'Not a hospital admin' });

    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const logoUrl = `/${req.file.path.replace(/\\/g, '/')}`;
    const hospital = await HospitalPartner.findByIdAndUpdate(
      hospitalId, 
      { logoUrl, updatedAt: Date.now() }, 
      { new: true }
    );

    res.json({ success: true, logoUrl, hospital });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload hospital image', message: err.message });
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
