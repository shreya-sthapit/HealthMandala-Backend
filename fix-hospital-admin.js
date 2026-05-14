// Fix hospital admin record
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const HospitalAdmin = require('./src/models/HospitalAdmin');
const HospitalPartner = require('./src/models/HospitalPartner');

async function fixAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    const actualHospital = await HospitalPartner.findOne();
    console.log('Actual Hospital:');
    console.log('  ID:', actualHospital._id.toString());
    console.log('  Name:', actualHospital.hospitalName);

    const admin = await HospitalAdmin.findOne();
    console.log('\nOld Admin Record:');
    console.log('  hospitalId:', admin.hospitalId.toString());
    console.log('  hospitalName:', admin.hospitalName);

    // Update to correct hospital ID
    admin.hospitalId = actualHospital._id;
    admin.hospitalName = actualHospital.hospitalName;
    await admin.save();

    console.log('\n✅ Fixed! New Admin Record:');
    console.log('  hospitalId:', admin.hospitalId.toString());
    console.log('  hospitalName:', admin.hospitalName);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAdmin();
