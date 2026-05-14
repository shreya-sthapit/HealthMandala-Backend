// Script to debug what's in the database
// Run this with: node debug-data.js

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const DoctorRegistration = require('./src/models/DoctorRegistration');
const Department = require('./src/models/Department');
const HospitalPartner = require('./src/models/HospitalPartner');

async function debugData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get hospital
    const hospital = await HospitalPartner.findOne();
    console.log('=== HOSPITAL ===');
    console.log('Name:', hospital.hospitalName);
    console.log('ID:', hospital._id.toString());
    console.log('Doctors array:', hospital.doctors?.map(d => d.toString()) || []);

    // Get all doctors
    const doctors = await DoctorRegistration.find();
    console.log('\n=== DOCTORS ===');
    for (const doc of doctors) {
      console.log(`\nDoctor: ${doc.firstName} ${doc.lastName}`);
      console.log('  ID:', doc._id.toString());
      console.log('  Specialization:', doc.specialization);
      console.log('  managedByHospitals:', doc.managedByHospitals?.map(h => h.toString()) || []);
      console.log('  currentHospital:', doc.currentHospital || []);
      console.log('  hospitalSchedules:', doc.hospitalSchedules?.map(h => h.hospital) || []);
    }

    // Get all departments
    const departments = await Department.find();
    console.log('\n=== DEPARTMENTS ===');
    for (const dept of departments) {
      console.log(`\nDepartment: ${dept.name}`);
      console.log('  ID:', dept._id.toString());
      console.log('  hospitalId:', dept.hospitalId?.toString() || 'NULL');
      console.log('  doctors:', dept.doctors?.map(d => d.toString()) || []);
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugData();
