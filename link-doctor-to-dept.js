// Script to manually link doctor to department
// Run this with: node link-doctor-to-dept.js

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const DoctorRegistration = require('./src/models/DoctorRegistration');
const Department = require('./src/models/Department');

async function linkDoctorToDept() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get all doctors
    const doctors = await DoctorRegistration.find();
    console.log(`Found ${doctors.length} doctors\n`);

    // Get all departments
    const departments = await Department.find();
    console.log(`Found ${departments.length} departments\n`);

    // Link each doctor to their department
    for (const doctor of doctors) {
      console.log(`\nProcessing: Dr. ${doctor.firstName} ${doctor.lastName}`);
      console.log('  Specialization:', doctor.specialization);

      if (!doctor.specialization) {
        console.log('  ⚠️  No specialization');
        continue;
      }

      // Find matching department
      const dept = departments.find(d => 
        d.name.toLowerCase().startsWith(doctor.specialization.toLowerCase())
      );

      if (dept) {
        const alreadyLinked = dept.doctors.some(d => d.toString() === doctor._id.toString());
        
        if (alreadyLinked) {
          console.log(`  ✓ Already linked to: ${dept.name}`);
        } else {
          await Department.findByIdAndUpdate(dept._id, {
            $addToSet: { doctors: doctor._id }
          });
          console.log(`  ✅ Linked to: ${dept.name}`);
        }
      } else {
        console.log(`  ❌ No matching department found`);
        console.log(`  Available departments:`, departments.map(d => d.name).join(', '));
      }
    }

    // Final summary
    console.log('\n=== FINAL SUMMARY ===');
    const finalDepts = await Department.find().populate('doctors');
    for (const dept of finalDepts) {
      console.log(`\n${dept.name}: ${dept.doctors.length} doctor(s)`);
      dept.doctors.forEach(d => {
        console.log(`  - Dr. ${d.firstName} ${d.lastName}`);
      });
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

linkDoctorToDept();
