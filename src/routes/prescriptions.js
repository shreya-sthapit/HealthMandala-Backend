const express = require('express');
const router = express.Router();
const Prescription = require('../models/Prescription');

// Create new prescription
router.post('/create', async (req, res) => {
  try {
    const {
      patientId,
      doctorId,
      appointmentId,
      medicines,
      diagnosis,
      notes,
      followUpDate,
      tests,
      doctorName,
      patientName
    } = req.body;

    console.log('Creating prescription for patient:', patientName);

    const prescription = new Prescription({
      patientId,
      doctorId,
      appointmentId,
      medicines,
      diagnosis,
      notes,
      followUpDate,
      tests,
      doctorName,
      patientName,
      checkupDate: new Date()
    });

    await prescription.save();
    console.log('Prescription saved:', prescription._id);

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      prescription: {
        id: prescription._id,
        checkupDate: prescription.checkupDate,
        diagnosis: prescription.diagnosis
      }
    });
  } catch (error) {
    console.error('Prescription creation error:', error);
    res.status(500).json({ error: 'Failed to create prescription', message: error.message });
  }
});

// Get all prescriptions for a patient
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const prescriptions = await Prescription.find({ patientId })
      .sort({ checkupDate: -1 })
      .populate('doctorId', 'firstName lastName');

    console.log('Found prescriptions for patient:', prescriptions.length);

    res.json({ success: true, prescriptions });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to fetch prescriptions', message: error.message });
  }
});

// Get prescriptions for a patient by doctor
router.get('/patient/:patientId/doctor/:doctorId', async (req, res) => {
  try {
    const { patientId, doctorId } = req.params;

    const prescriptions = await Prescription.find({ patientId, doctorId })
      .sort({ checkupDate: -1 })
      .populate('doctorId', 'firstName lastName');

    console.log('Found prescriptions for patient by doctor:', prescriptions.length);

    res.json({ success: true, prescriptions });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to fetch prescriptions', message: error.message });
  }
});

// Get single prescription
router.get('/:prescriptionId', async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    const prescription = await Prescription.findById(prescriptionId)
      .populate('patientId', 'firstName lastName email phone')
      .populate('doctorId', 'firstName lastName');

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.json({ success: true, prescription });
  } catch (error) {
    console.error('Error fetching prescription:', error);
    res.status(500).json({ error: 'Failed to fetch prescription', message: error.message });
  }
});

// Update prescription
router.put('/:prescriptionId', async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { medicines, diagnosis, notes, followUpDate, tests } = req.body;

    const prescription = await Prescription.findByIdAndUpdate(
      prescriptionId,
      {
        medicines,
        diagnosis,
        notes,
        followUpDate,
        tests
      },
      { new: true }
    );

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.json({ success: true, message: 'Prescription updated successfully', prescription });
  } catch (error) {
    console.error('Error updating prescription:', error);
    res.status(500).json({ error: 'Failed to update prescription', message: error.message });
  }
});

// Delete prescription
router.delete('/:prescriptionId', async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    const prescription = await Prescription.findByIdAndDelete(prescriptionId);

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.json({ success: true, message: 'Prescription deleted successfully' });
  } catch (error) {
    console.error('Error deleting prescription:', error);
    res.status(500).json({ error: 'Failed to delete prescription', message: error.message });
  }
});

module.exports = router;

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'prescriptions' }));
