const express = require('express');
const router = express.Router();
const DoctorRegistration = require('../models/DoctorRegistration');
const User = require('../models/User');
const uploadConfigs = require('../config/multer');

// Create doctor registration with file uploads
router.post('/register', (req, res, next) => {
  console.log('Doctor registration request received');
  uploadConfigs.doctorUploads(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ 
        error: 'File upload error', 
        message: err.message 
      });
    }
    console.log('Files uploaded successfully');
    next();
  });
}, async (req, res) => {
  try {
    const data = req.body;
    console.log('Received doctor registration:', { firstName: data.firstName, specialization: data.specialization });
    console.log('Uploaded files:', req.files);

    // Get file paths from uploaded files
    const profilePhoto = req.files?.profilePhoto?.[0]?.path || null;
    const nidFrontImage = req.files?.nidFront?.[0]?.path || null;
    const nidBackImage = req.files?.nidBack?.[0]?.path || null;
    const nmcCertificateImage = req.files?.nmcCertificate?.[0]?.path || null;
    const degreeCertificateImage = req.files?.degreeCertificate?.[0]?.path || null;

    // Parse availableDays if it's a string
    let availableDays = data.availableDays;
    if (typeof availableDays === 'string') {
      try {
        availableDays = JSON.parse(availableDays);
      } catch (e) {
        console.log('Failed to parse availableDays, using as string');
      }
    }

    const registration = new DoctorRegistration({
      userId: data.userId || null,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      profilePhoto,
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      specialization: data.specialization,
      nmcNumber: data.nmcNumber,
      qualification: data.qualification,
      experienceYears: parseInt(data.experienceYears) || 0,
      currentHospital: data.currentHospital,
      consultationFee: parseInt(data.consultationFee) || 0,
      address: {
        street: data.address,
        city: data.city,
        district: data.district,
        province: data.province
      },
      availableDays: availableDays,
      availableTimeStart: data.availableTimeStart,
      availableTimeEnd: data.availableTimeEnd,
      nmcCertificateImage,
      degreeCertificateImage,
      nidNumber: data.nidNumber,
      nidFrontImage,
      nidBackImage,
      bio: data.bio,
      status: 'approved'  // auto-approved — admin supervises only
    });

    console.log('About to save doctor registration...');
    await registration.save();
    console.log('Doctor registration saved:', registration._id);

    res.status(201).json({
      success: true,
      message: 'Doctor registration submitted successfully',
      registration: { 
        id: registration._id, 
        status: registration.status,
        files: {
          profilePhoto,
          nidFrontImage,
          nidBackImage,
          nmcCertificateImage,
          degreeCertificateImage
        }
      }
    });
  } catch (error) {
    console.error('Doctor registration error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Registration failed', 
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
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
      .select('firstName lastName specialization consultationFee experienceYears currentHospital availableDays availableTimeStart availableTimeEnd address profilePhoto schedule lunchBreak consultationDuration leaves')
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
        experience: `${doc.experienceYears} yrs`,
        fee: doc.consultationFee,
        available: true,
        hospital: doc.currentHospital,
        availableDays: doc.availableDays,
        availableTimeStart: doc.availableTimeStart,
        availableTimeEnd: doc.availableTimeEnd,
        address: doc.address,
        profilePhoto: doc.profilePhoto,
        schedule: doc.schedule,
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

// Update doctor schedule
router.put('/schedule/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { schedule, lunchBreak, consultationDuration, consultationFee, maxPatientsPerDay } = req.body;

    // Find doctor by userId
    const doctor = await DoctorRegistration.findOne({ userId });
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Update schedule fields
    if (schedule) doctor.schedule = schedule;
    if (lunchBreak) doctor.lunchBreak = lunchBreak;
    if (consultationDuration) doctor.consultationDuration = consultationDuration;
    if (consultationFee) doctor.consultationFee = consultationFee;
    if (maxPatientsPerDay) doctor.maxPatientsPerDay = maxPatientsPerDay;

    // Update availableDays and time range for backward compatibility
    if (schedule) {
      doctor.availableDays = schedule.filter(s => s.active).map(s => s.day);
      const activeDays = schedule.filter(s => s.active);
      if (activeDays.length > 0) {
        doctor.availableTimeStart = activeDays[0].start;
        doctor.availableTimeEnd = activeDays[0].end;
      }
    }

    await doctor.save();

    res.json({ 
      success: true, 
      message: 'Schedule updated successfully',
      doctor: {
        schedule: doctor.schedule,
        lunchBreak: doctor.lunchBreak,
        consultationDuration: doctor.consultationDuration,
        consultationFee: doctor.consultationFee,
        maxPatientsPerDay: doctor.maxPatientsPerDay
      }
    });
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

module.exports = router;
