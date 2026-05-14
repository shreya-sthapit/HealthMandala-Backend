// Check hospital admin records
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const HospitalAdmin = require('./src/models/HospitalAdmin');
const HospitalPartner = require('./src/models/HospitalPartner');
const User = require('./src/models/User');

async function checkAdmins() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    const admins = await HospitalAdmin.find();
    console.log(`Found ${admins.length} hospital admin records:\n`);

    for (const admin of admins) {
      console.log('Admin Record:');
      console.log('  userId:', admin.userId?.toString());
      console.log('  hospitalId:', admin.hospitalId?.toString());
      console.log('  hospitalName:', admin.hospitalName);

      // Check if hospital exists
      const hospital = await HospitalPartner.findById(admin.hospitalId);
      if (hospital) {
        console.log('  ✅ Hospital exists:', hospital.hospitalName);
      } else {
        console.log('  ❌ Hospital NOT FOUND - STALE RECORD!');
      }

      // Check user
      const user = await User.findById(admin.userId);
      if (user) {
        console.log('  User:', user.email || user.phone);
      }
      console.log('');
    }

    // Show actual hospital
    const actualHospital = await HospitalPartner.findOne();
    console.log('\nActual Hospital in Database:');
    console.log('  ID:', actualHospital._id.toString());
    console.log('  Name:', actualHospital.hospitalName);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAdmins();
