/**
 * Check hospital facility categories in database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const HospitalPartner = require('./src/models/HospitalPartner');

async function checkCategories() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const hospitals = await HospitalPartner.find({});
    
    console.log(`Found ${hospitals.length} hospitals:\n`);
    
    hospitals.forEach((hospital, index) => {
      console.log(`${index + 1}. ${hospital.hospitalName}`);
      console.log(`   Category: "${hospital.facilityCategory}"`);
      console.log(`   Status: ${hospital.status}`);
      console.log('');
    });

    // Show unique categories
    const uniqueCategories = [...new Set(hospitals.map(h => h.facilityCategory))];
    console.log('Unique categories in database:');
    uniqueCategories.forEach(cat => {
      console.log(`  - "${cat}"`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCategories();
