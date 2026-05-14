// Script to fix orphaned doctors and departments
// Run this with: node fix-orphaned-data.js

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const DoctorRegistration = require('./src/models/DoctorRegistration');
const Department = require('./src/models/Department');
const HospitalPartner = require('./src/models/HospitalPartner');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fixOrphanedData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the hospital
    const hospitals = await HospitalPartner.find();
    if (hospitals.length === 0) {
      console.log('No hospitals found!');
      process.exit(1);
    }

    const hospital = hospitals[0]; // Use first hospital
    console.log(`\n=== Fixing data for: ${hospital.hospitalName} ===`);
    console.log(`Hospital ID: ${hospital._id}`);

    // Fix orphaned doctors (doctors with no hospital)
    const orphanedDoctors = await DoctorRegistration.find({
      $or: [
        { managedByHospitals: { $exists: false } },
        { managedByHospitals: { $size: 0 } },
        { currentHospital: { $exists: false } },
        { currentHospital: { $size: 0 } }
      ]
    });

    console.log(`\nFound ${orphanedDoctors.length} orphaned doctors`);

    for (const doctor of orphanedDoctors) {
      console.log(`\nFixing Dr. ${doctor.firstName} ${doctor.lastName}:`);
      
      // Add hospital association
      doctor.managedByHospitals = [hospital._id];
      doctor.currentHospital = [hospital.hospitalName];
      
      // Add hospital schedule if missing
      if (!doctor.hospitalSchedules || doctor.hospitalSchedules.length === 0) {
        doctor.hospitalSchedules = [{
          hospital: hospital.hospitalName,
          schedule: doctor.schedule || []
        }];
      }
      
      await doctor.save();
      console.log(`  ✅ Added to ${hospital.hospitalName}`);
      
      // Add to hospital's doctors array
      await HospitalPartner.findByIdAndUpdate(hospital._id, {
        $addToSet: { doctors: doctor._id }
      });
      console.log(`  ✅ Added to hospital's doctors array`);
      
      // Link to department
      if (doctor.specialization) {
        let dept = await Department.findOne({
          hospitalId: hospital._id,
          name: { $regex: new RegExp(`^${escapeRegex(doctor.specialization)}\\s*\\(`, 'i') }
        });
        
        if (!dept) {
          dept = await Department.findOne({
            hospitalId: hospital._id,
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

    // Fix orphaned departments (departments with no hospitalId)
    const orphanedDepts = await Department.find({
      $or: [
        { hospitalId: { $exists: false } },
        { hospitalId: null }
      ]
    });

    console.log(`\nFound ${orphanedDepts.length} orphaned departments`);

    for (const dept of orphanedDepts) {
      console.log(`\nFixing department: ${dept.name}`);
      dept.hospitalId = hospital._id;
      await dept.save();
      console.log(`  ✅ Linked to ${hospital.hospitalName}`);
    }

    // Summary
    console.log('\n=== Summary ===');
    const totalDoctors = await DoctorRegistration.find({ managedByHospitals: hospital._id });
    const totalDepts = await Department.find({ hospitalId: hospital._id });
    
    console.log(`Hospital: ${hospital.hospitalName}`);
    console.log(`Doctors: ${totalDoctors.length}`);
    console.log(`Departments: ${totalDepts.length}`);
    
    for (const dept of totalDepts) {
      const deptWithDoctors = await Department.findById(dept._id).populate('doctors');
      console.log(`  - ${dept.name}: ${deptWithDoctors.doctors.length} doctors`);
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixOrphanedData();
