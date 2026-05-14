// Script to manually link existing doctors to their departments
// Run this with: cd backend && node ../fix-department-links.js

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const DoctorRegistration = require('./src/models/DoctorRegistration');
const Department = require('./src/models/Department');
const HospitalPartner = require('./src/models/HospitalPartner');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fixDepartmentLinks() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check all doctors in the system
    const allDoctors = await DoctorRegistration.find();
    console.log(`\n=== Total doctors in system: ${allDoctors.length} ===`);
    if (allDoctors.length > 0) {
      allDoctors.forEach(d => {
        console.log(`  - Dr. ${d.firstName} ${d.lastName} (${d.specialization || 'No specialization'})`);
        console.log(`    Hospitals: ${d.currentHospital?.join(', ') || 'None'}`);
      });
    }

    // Check all departments in the system
    const allDepartments = await Department.find();
    console.log(`\n=== Total departments in system: ${allDepartments.length} ===`);
    if (allDepartments.length > 0) {
      allDepartments.forEach(d => {
        console.log(`  - ${d.name} (${d.doctors?.length || 0} doctors)`);
      });
    }

    // Get all hospitals
    const hospitals = await HospitalPartner.find();
    console.log(`\n=== Found ${hospitals.length} hospitals ===`);

    for (const hospital of hospitals) {
      console.log(`\n=== Processing ${hospital.hospitalName} ===`);
      
      // Get all doctors for this hospital
      const doctors = await DoctorRegistration.find({ 
        managedByHospitals: hospital._id 
      });
      console.log(`Found ${doctors.length} doctors`);

      // Get all departments for this hospital
      const departments = await Department.find({ hospitalId: hospital._id });
      console.log(`Found ${departments.length} departments`);

      for (const doctor of doctors) {
        const specialization = doctor.specialization;
        if (!specialization) {
          console.log(`  - Dr. ${doctor.firstName} ${doctor.lastName}: No specialization`);
          continue;
        }

        // Try to find matching department
        let dept = await Department.findOne({
          hospitalId: hospital._id,
          name: { $regex: new RegExp(`^${escapeRegex(specialization)}\\s*\\(`, 'i') }
        });

        if (!dept) {
          dept = await Department.findOne({
            hospitalId: hospital._id,
            name: { $regex: new RegExp(`^${escapeRegex(specialization)}$`, 'i') }
          });
        }

        if (dept) {
          // Check if already linked
          const alreadyLinked = dept.doctors.some(d => d.toString() === doctor._id.toString());
          if (alreadyLinked) {
            console.log(`  ✓ Dr. ${doctor.firstName} ${doctor.lastName} (${specialization}) already linked to ${dept.name}`);
          } else {
            // Link doctor to department
            await Department.findByIdAndUpdate(dept._id, { 
              $addToSet: { doctors: doctor._id } 
            });
            console.log(`  ✅ Linked Dr. ${doctor.firstName} ${doctor.lastName} (${specialization}) to ${dept.name}`);
          }
        } else {
          console.log(`  ❌ Dr. ${doctor.firstName} ${doctor.lastName} (${specialization}): No matching department`);
          console.log(`     Available departments:`, departments.map(d => d.name).join(', '));
        }
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDepartmentLinks();
