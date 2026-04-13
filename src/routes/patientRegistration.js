const express = require('express');
const router = express.Router();
const PatientRegistration = require('../models/PatientRegistration');
const User = require('../models/User');
const uploadConfigs = require('../config/multer');

// Create patient registration with file uploads
router.post('/register', uploadConfigs.patientUploads, async (req, res) => {
  try {
    const {
      userId,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      city,
      district,
      province,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      medicalConditions,
      allergies,
      nidNumber
    } = req.body;

    console.log('Received registration data:', { userId, firstName, lastName, dateOfBirth, gender, nidNumber });
    console.log('Uploaded files:', req.files);

    // Get file paths from uploaded files
    const profilePhoto = req.files?.profilePhoto?.[0]?.path || null;
    const nidFrontImage = req.files?.nidFront?.[0]?.path || null;
    const nidBackImage = req.files?.nidBack?.[0]?.path || null;

    // Create new patient registration
    const registration = new PatientRegistration({
      userId: userId || null,
      firstName,
      lastName,
      email,
      phone,
      profilePhoto,
      dateOfBirth,
      gender,
      bloodGroup,
      address: {
        street: address,
        city,
        district,
        province
      },
      emergencyContact: {
        name: emergencyContactName,
        phone: emergencyContactPhone,
        relation: emergencyContactRelation
      },
      medicalConditions,
      allergies,
      nidNumber,
      nidFrontImage,
      nidBackImage,
      status: 'approved'  // auto-approved — admin supervises only
    });

    await registration.save();
    console.log('Registration saved:', registration._id);

    // Update user's NID info as well
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        nidNumber,
        nidFrontImage,
        nidBackImage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Patient registration submitted successfully',
      registration: {
        id: registration._id,
        status: registration.status,
        files: {
          profilePhoto,
          nidFrontImage,
          nidBackImage
        }
      }
    });
  } catch (error) {
    console.error('Patient registration error:', error);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

// Get patient registration by userId
router.get('/user/:userId', async (req, res) => {
  try {
    const registration = await PatientRegistration.findOne({ userId: req.params.userId });
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    res.json({ success: true, registration });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get registration', message: error.message });
  }
});

// Get all pending registrations (for admin)
router.get('/pending', async (req, res) => {
  try {
    const registrations = await PatientRegistration.find({ status: 'pending' })
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, registrations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get registrations', message: error.message });
  }
});

// Update registration status (for admin approval)
router.put('/status/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const registration = await PatientRegistration.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    // If approved, update user status to active
    if (status === 'approved' && registration.userId) {
      await User.findByIdAndUpdate(registration.userId, { status: 'active' });
    }

    res.json({ success: true, registration });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status', message: error.message });
  }
});

// Get patient profile by userId
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // First try to find by userId
    let patientProfile = await PatientRegistration.findOne({ 
      userId, 
      status: 'approved' 
    }).populate('userId', 'firstName lastName email phone');

    // If not found, try to find by registration _id (in case userId is actually registration ID)
    if (!patientProfile) {
      patientProfile = await PatientRegistration.findOne({
        _id: userId,
        status: 'approved'
      }).populate('userId', 'firstName lastName email phone');
    }

    if (!patientProfile) {
      return res.status(404).json({ error: 'Approved patient profile not found' });
    }

    res.json({ success: true, profile: patientProfile });
  } catch (error) {
    console.error('Error fetching patient profile:', error);
    res.status(500).json({ error: 'Failed to fetch patient profile', message: error.message });
  }
});

// Check registration status by userId
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // First try to find by userId
    let registration = await PatientRegistration.findOne({ userId })
      .populate('userId', 'firstName lastName email phone');

    // If not found, try to find by registration _id (in case userId is actually registration ID)
    if (!registration) {
      registration = await PatientRegistration.findById(userId)
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
    const registrations = await PatientRegistration.find({})
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
        status: reg.status,
        createdAt: reg.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching all registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations', message: error.message });
  }
});

module.exports = router;

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'patient' }));

// Get patient count
router.get('/count', async (req, res) => {
  try {
    const total = await PatientRegistration.countDocuments();
    const approved = await PatientRegistration.countDocuments({ status: 'approved' });
    res.json({ success: true, counts: { total, approved } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get count', message: error.message });
  }
});
