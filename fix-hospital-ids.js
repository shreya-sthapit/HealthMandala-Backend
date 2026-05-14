// Script to fix mismatched hospital IDs
// Run this with: node fix-hospital-ids.js

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const DoctorRegistration = require('./src/models/DoctorRegistration');
const Department = require('./src/models/Department');
const HospitalPartner = require('./src/models/HospitalPartner');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fixHospitalIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get the actual hospital
    const hospital = await HospitalPartner.findOne();
    if (!hospital) {
      console.log('No hospital found!');
      process.exit(1);
    }

    console.log('=== CURRENT HOSPITAL ===');
    console.log('Name:', hospital.hospitalName);
    console.log('ID:', hospital._id.toString());

    const correctHospitalId = hospital._id;
    const hospitalName = hospital.hospitalName;

    // Fix all doctors
    const allDoctors = await DoctorRegistration.find();
    console.log(`\n=== FIXING ${allDoctors.length} DOCTORS ===`);

    for (const doctor of allDoctors) {
      console.log(`\nDoctor: ${doctor.firstName} ${doctor.lastName}`);
      console.log('  Old managedByHospitals:', doctor.managedByHospitals?.map(h => h.toString()) || []);
      
      // Update hospital references
      doctor.managedByHospitals = [correctHospitalId];
      doctor.currentHospital = [hospitalName];
      
      // Fix hospital schedules
      if (doctor.hospitalSchedules && doctor.hospitalSchedules.length > 0) {
        doctor.hospitalSchedules = doctor.hospitalSchedules.map(hs => ({
          ...hs,
          hospital: hospitalName
        }));
      } else {
        doctor.hospitalSchedules = [{
          hospital: hospitalName,
          schedule: doctor.schedule || []
        }];
      }
      
      await doctor.save();
      console.log('  ✅ Fixed hospital references');
      
      // Add to hospital's doctors array
      await HospitalPartner.findByIdAndUpdate(correctHospitalId, {
        $addToSet: { doctors: doctor._id }
      });
      console.log('  ✅ Added to hospital doctors array');
      
      // Link to department
      if (doctor.specialization) {
        let dept = await Department.findOne({
          hospitalId: correctHospitalId,
          name: { $regex: new RegExp(`^${escapeRegex(doctor.specialization)}\\s*\\(`, 'i') }
        });
        
        if (!dept) {
          dept = await Department.findOne({
            hospitalId: correctHospitalId,
            name: { $regex: new RegExp(`^${escapeRegex(doctor.specialization)}$`, 'i') }
          });
        }
        
        if (dept) {
          await Department.findByIdAndUpdate(dept._id, {
            $addToSet: { doctors: doctor._id }
          });
          console.log(`  ✅ Linked to department: ${dept.name}`);
        } else {
          console.log(`  ⚠️  No matching department for: ${doctor.specialization}`);
        }
      }
    }

    // Fix all departments
    const allDepartments = await Department.find();
    console.log(`\n=== FIXING ${allDepartments.length} DEPARTMENTS ===`);

    for (const dept of allDepartments) {
      console.log(`\nDepartment: ${dept.name}`);
      console.log('  Old hospitalId:', dept.hospitalId?.toString() || 'NULL');
      
      dept.hospitalId = correctHospitalId;
      await dept.save();
      console.log('  ✅ Fixed hospitalId');
    }

    // Summary
    console.log('\n=== FINAL SUMMARY ===');
    const finalDoctors = await DoctorRegistration.find({ managedByHospitals: correctHospitalId });
    const finalDepts = await Department.find({ hospitalId: correctHospitalId }).populate('doctors');
    
    console.log(`\nHospital: ${hospitalName}`);
    console.log(`Total Doctors: ${finalDoctors.length}`);
    console.log(`Total Departments: ${finalDepts.length}\n`);
    
    for (const dept of finalDepts) {
      console.log(`  ${dept.name}: ${dept.doctors.length} doctor(s)`);
      dept.doctors.forEach(d => {
        console.log(`    - Dr. ${d.firstName} ${d.lastName}`);
      });
    }

    console.log('\n✅ All fixed!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixHospitalIds();
