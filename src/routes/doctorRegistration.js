const express = require('express');
const router = express.Router();
const DoctorRegistration = require('../models/DoctorRegistration');
const User = require('../models/User');
const uploadConfigs = require('../config/multer');

// Doctor self-registration disabled — doctors are now added by hospitals only
router.post('/register', (req, res) => {
  res.status(403).json({ error: 'Doctor self-registration is no longer available. Please contact your hospital administrator.' });
});

// Get pending registrations (for admin)
router.get('/pending', async (req, res) => {
  try {
    const registrations = await DoctorRegistration.find({ status: 'pending' })
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, registrations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get registrations', message: error.message });
  }
});

// Update status (admin approval)
router.put('/status/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const registration = await DoctorRegistration.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (status === 'approved' && registration.userId) {
      await User.findByIdAndUpdate(registration.userId, { status: 'active' });
    }

    res.json({ success: true, registration });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status', message: error.message });
  }
});

// Get specialty counts for approved doctors
router.get('/specialty-counts', async (req, res) => {
  try {
    const counts = await DoctorRegistration.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$specialization', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const result = {};
    counts.forEach(item => {
      if (item._id) result[item._id] = item.count;
    });

    res.json({ success: true, counts: result });
  } catch (error) {
    console.error('Error fetching specialty counts:', error);
    res.status(500).json({ error: 'Failed to fetch specialty counts', message: error.message });
  }
});

// Get approved doctors for booking
router.get('/approved', async (req, res) => {
  try {
    const doctors = await DoctorRegistration.find({ status: { $in: ['approved', 'pending'] } })
      .select('firstName lastName specialization consultationFee experienceYears currentHospital availableDays availableTimeStart availableTimeEnd address profilePhoto schedule hospitalSchedules lunchBreak consultationDuration leaves')
      .sort({ createdAt: -1 });

    console.log('Found approved doctors:', doctors.length);
    doctors.forEach(doc => {
      console.log(`Doctor: ${doc.firstName} ${doc.lastName}, Specialization: ${doc.specialization}`);
    });

    // Transform data for frontend compatibility
    const transformedDoctors = doctors.map(doc => {
      // Normalize specialization to match frontend specialty IDs
      const specialization = doc.specialization || '';
      let specialtyId = specialization.toLowerCase().replace(/\s+/g, '');
      
      // Map common specialization names to specialty IDs
      const specializationMap = {
        'cardiology': 'cardiology',
        'cardiologist': 'cardiology',
        'neurology': 'neurology',
        'neurologist': 'neurology',
        'orthopedics': 'orthopedics',
        'orthopedic': 'orthopedics',
        'dermatology': 'dermatology',
        'dermatologist': 'dermatology',
        'pediatrics': 'pediatrics',
        'pediatrician': 'pediatrics',
        'ophthalmology': 'ophthalmology',
        'ophthalmologist': 'ophthalmology',
        'dental': 'dental',
        'dentist': 'dental',
        'dentistry': 'dental',
        'general': 'general',
        'generalpractitioner': 'general',
        'gp': 'general'
      };
      
      // Use mapped ID if available, otherwise use normalized version
      specialtyId = specializationMap[specialtyId] || specialtyId;
      
      console.log(`Mapped specialization "${specialization}" to specialtyId "${specialtyId}"`);
      
      return {
        id: doc._id,
        name: `Dr. ${doc.firstName} ${doc.lastName}`,
        specialty: specialization,
        specialtyId: specialtyId,
        rating: 4.5 + Math.random() * 0.4, // Generate random rating between 4.5-4.9
        patients: Math.floor(Math.random() * 1000 + 500) + '', // Random patient count
        experience: `${doc.experienceYears} years`,
        fee: doc.consultationFee,
        available: true,
        hospital: doc.currentHospital,
        availableDays: doc.availableDays,
        availableTimeStart: doc.availableTimeStart,
        availableTimeEnd: doc.availableTimeEnd,
        address: doc.address,
        profilePhoto: doc.profilePhoto,
        schedule: doc.schedule || (doc.hospitalSchedules && doc.hospitalSchedules[0] ? doc.hospitalSchedules[0].schedule : []),
        hospitalSchedules: doc.hospitalSchedules,
        lunchBreak: doc.lunchBreak,
        consultationDuration: doc.consultationDuration,
        leaves: doc.leaves
      };
    });

    res.json({ success: true, doctors: transformedDoctors });
  } catch (error) {
    console.error('Error fetching approved doctors:', error);
    res.status(500).json({ error: 'Failed to fetch doctors', message: error.message });
  }
});

// Get doctor profile by userId
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // First try to find by userId
    let doctorProfile = await DoctorRegistration.findOne({ 
      userId, 
      status: 'approved' 
    }).populate('userId', 'firstName lastName email phone');

    // If not found, try to find by registration _id (in case userId is actually registration ID)
    if (!doctorProfile) {
      doctorProfile = await DoctorRegistration.findOne({
        _id: userId,
        status: 'approved'
      }).populate('userId', 'firstName lastName email phone');
    }

    if (!doctorProfile) {
      return res.status(404).json({ error: 'Approved doctor profile not found' });
    }

    // Include schedule, lunch break, and leaves in response
    const profileData = doctorProfile.toObject();
    
    res.json({ success: true, profile: profileData });
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    res.status(500).json({ error: 'Failed to fetch doctor profile', message: error.message });
  }
});

// Check registration status by userId
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // First try to find by userId
    let registration = await DoctorRegistration.findOne({ userId })
      .populate('userId', 'firstName lastName email phone');

    // If not found, try to find by registration _id (in case userId is actually registration ID)
    if (!registration) {
      registration = await DoctorRegistration.findById(userId)
        .populate('userId', 'firstName lastName email phone');
    }

    if (!registration) {
      return res.json({ 
        success: true, 
        hasRegistration: false, 
        message: 'No registration found. Please complete your registration.' 
      });
    }

    res.json({ 
      success: true, 
      hasRegistration: true, 
      status: registration.status,
      registration: registration
    });
  } catch (error) {
    console.error('Error checking registration status:', error);
    res.status(500).json({ error: 'Failed to check registration status', message: error.message });
  }
});

// Temporary debug endpoint
router.get('/debug/all', async (req, res) => {
  try {
    const registrations = await DoctorRegistration.find({})
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      count: registrations.length,
      registrations: registrations.map(reg => ({
        id: reg._id,
        userId: reg.userId?._id,
        userEmail: reg.userId?.email,
        firstName: reg.firstName,
        lastName: reg.lastName,
        email: reg.email,
        specialization: reg.specialization,
        status: reg.status,
        schedule: reg.schedule,
        availableDays: reg.availableDays,
        lunchBreak: reg.lunchBreak,
        createdAt: reg.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching all registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations', message: error.message });
  }
});

// Debug endpoint to check specific doctor schedule
router.get('/debug/schedule/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    // Try finding by userId first
    let doctor = await DoctorRegistration.findOne({ userId: doctorId });
    
    // If not found, try by _id
    if (!doctor) {
      doctor = await DoctorRegistration.findById(doctorId);
    }
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    
    res.json({
      success: true,
      doctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        status: doctor.status,
        schedule: doctor.schedule,
        availableDays: doctor.availableDays,
        availableTimeStart: doctor.availableTimeStart,
        availableTimeEnd: doctor.availableTimeEnd,
        lunchBreak: doctor.lunchBreak,
        consultationDuration: doctor.consultationDuration
      }
    });
  } catch (error) {
    console.error('Error fetching doctor schedule:', error);
    res.status(500).json({ error: 'Failed to fetch doctor schedule', message: error.message });
  }
});

// Update doctor schedule (supports per-hospital)
router.put('/schedule/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { schedule, lunchBreak, consultationDuration, consultationFee, maxPatientsPerDay, hospital } = req.body;

    const doctor = await DoctorRegistration.findOne({ userId });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    if (consultationFee) doctor.consultationFee = consultationFee;

    if (hospital) {
      // Per-hospital schedule update
      if (!doctor.hospitalSchedules) doctor.hospitalSchedules = [];
      const idx = doctor.hospitalSchedules.findIndex(hs => hs.hospital === hospital);
      const entry = {
        hospital,
        schedule: schedule || [],
        lunchBreak: lunchBreak || { start: '13:00', end: '14:00' },
        consultationDuration: consultationDuration || 30,
        maxPatientsPerDay: maxPatientsPerDay || 20
      };
      if (idx >= 0) doctor.hospitalSchedules[idx] = entry;
      else doctor.hospitalSchedules.push(entry);

      // Keep legacy fields in sync using first hospital's schedule
      const first = doctor.hospitalSchedules[0];
      if (first) {
        doctor.schedule = first.schedule;
        doctor.lunchBreak = first.lunchBreak;
        doctor.consultationDuration = first.consultationDuration;
        doctor.maxPatientsPerDay = first.maxPatientsPerDay;
        doctor.availableDays = first.schedule.filter(s => s.active).map(s => s.day);
        const active = first.schedule.filter(s => s.active);
        if (active.length > 0) {
          doctor.availableTimeStart = active[0].start;
          doctor.availableTimeEnd = active[0].end;
        }
      }
    } else {
      // Legacy flat schedule update
      if (schedule) {
        doctor.schedule = schedule;
        doctor.availableDays = schedule.filter(s => s.active).map(s => s.day);
        const active = schedule.filter(s => s.active);
        if (active.length > 0) {
          doctor.availableTimeStart = active[0].start;
          doctor.availableTimeEnd = active[0].end;
        }
      }
      if (lunchBreak) doctor.lunchBreak = lunchBreak;
      if (consultationDuration) doctor.consultationDuration = consultationDuration;
      if (maxPatientsPerDay) doctor.maxPatientsPerDay = maxPatientsPerDay;
    }

    await doctor.save();
    res.json({ success: true, message: 'Schedule updated successfully', hospitalSchedules: doctor.hospitalSchedules });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule', message: error.message });
  }
});

// Add leave
router.post('/leave/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, reason } = req.body;

    const doctor = await DoctorRegistration.findOne({ userId });
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    if (!doctor.leaves) {
      doctor.leaves = [];
    }

    doctor.leaves.push({ startDate, endDate, reason });
    await doctor.save();

    res.json({ 
      success: true, 
      message: 'Leave added successfully',
      leaves: doctor.leaves
    });
  } catch (error) {
    console.error('Error adding leave:', error);
    res.status(500).json({ error: 'Failed to add leave', message: error.message });
  }
});

// Remove leave
router.delete('/leave/:userId/:leaveId', async (req, res) => {
  try {
    const { userId, leaveId } = req.params;

    const doctor = await DoctorRegistration.findOne({ userId });
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    doctor.leaves = doctor.leaves.filter(leave => leave._id.toString() !== leaveId);
    await doctor.save();

    res.json({ 
      success: true, 
      message: 'Leave removed successfully',
      leaves: doctor.leaves
    });
  } catch (error) {
    console.error('Error removing leave:', error);
    res.status(500).json({ error: 'Failed to remove leave', message: error.message });
  }
});

// Get available time slots for a doctor on a specific date
router.get('/slots/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, hospitalName } = req.query;

    if (!date || !hospitalName) {
      return res.status(400).json({ error: 'Date and hospitalName are required' });
    }

    const doctor = await DoctorRegistration.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const { generateDoctorSlots } = require('../utils/slotGenerator');
    const appointmentDate = new Date(date);
    const slots = generateDoctorSlots(doctor, appointmentDate, hospitalName);

    // Get booked appointments for this doctor on this date
    const Appointment = require('../models/Appointment');
    const bookedAppointments = await Appointment.find({
      doctorId: doctorId,
      appointmentDate: {
        $gte: new Date(date + 'T00:00:00.000Z'),
        $lt: new Date(date + 'T23:59:59.999Z')
      },
      status: { $nin: ['cancelled', 'rejected'] }
    });

    // Extract booked time slots
    const bookedSlots = bookedAppointments.map(apt => apt.appointmentTime);

    // Filter out booked slots
    const availableSlots = slots.filter(slot => !bookedSlots.includes(slot));

    res.json({
      success: true,
      date,
      totalSlots: slots.length,
      bookedSlots: bookedSlots.length,
      availableSlots: availableSlots.length,
      slots: availableSlots
    });
  } catch (error) {
    console.error('Error generating slots:', error);
    res.status(500).json({ error: 'Failed to generate slots', message: error.message });
  }
});

module.exports = router;

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'doctor' }));

// Get doctor count by status
router.get('/count', async (req, res) => {
  try {
    const approved = await DoctorRegistration.countDocuments({ status: 'approved' });
    const pending = await DoctorRegistration.countDocuments({ status: 'pending' });
    res.json({ success: true, counts: { approved, pending, total: approved + pending } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get count', message: error.message });
  }
});
