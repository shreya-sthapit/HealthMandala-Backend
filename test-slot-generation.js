/**
 * Test script for slot generation utility
 */

const { generateTimeSlots, generateDoctorSlots } = require('./src/utils/slotGenerator');

console.log('=== Testing Slot Generation ===\n');

// Test 1: Basic slot generation without break
console.log('Test 1: 9:00 AM to 12:00 PM (no break)');
const slots1 = generateTimeSlots('09:00', '12:00');
console.log(`Generated ${slots1.length} slots:`, slots1.slice(0, 5), '...', slots1.slice(-3));
console.log('');

// Test 2: Slot generation with break time
console.log('Test 2: 9:00 AM to 2:00 PM with 12:00-1:00 PM break');
const slots2 = generateTimeSlots('09:00', '14:00', '12:00', '13:00');
console.log(`Generated ${slots2.length} slots:`);
console.log('Morning slots:', slots2.filter(s => s < '12:00'));
console.log('Afternoon slots:', slots2.filter(s => s >= '13:00'));
console.log('');

// Test 3: Slot generation with minutes (9:30 AM start)
console.log('Test 3: 9:30 AM to 11:30 AM (no break)');
const slots3 = generateTimeSlots('09:30', '11:30');
console.log(`Generated ${slots3.length} slots:`, slots3);
console.log('');

// Test 4: Full day schedule with break
console.log('Test 4: 9:00 AM to 5:00 PM with 12:30-1:30 PM break');
const slots4 = generateTimeSlots('09:00', '17:00', '12:30', '13:30');
console.log(`Generated ${slots4.length} slots`);
console.log('First 5 slots:', slots4.slice(0, 5));
console.log('Around break time:', slots4.filter(s => s >= '12:00' && s <= '14:00'));
console.log('Last 5 slots:', slots4.slice(-5));
console.log('');

// Test 5: Mock doctor schedule
console.log('Test 5: Doctor schedule for Monday');
const mockDoctor = {
  firstName: 'Test',
  lastName: 'Doctor',
  hospitalSchedules: [{
    hospital: 'Test Hospital',
    schedule: [
      { day: 'Monday', start: '09:00', end: '14:00', active: true, breakStart: '12:00', breakEnd: '13:00' },
      { day: 'Tuesday', start: '10:00', end: '15:00', active: true, breakStart: '12:30', breakEnd: '13:30' },
      { day: 'Saturday', start: '09:00', end: '12:00', active: false }
    ]
  }],
  leaves: []
};

const monday = new Date('2026-05-18'); // A Monday
const slots5 = generateDoctorSlots(mockDoctor, monday, 'Test Hospital');
console.log(`Generated ${slots5.length} slots for Monday:`, slots5.slice(0, 5), '...', slots5.slice(-3));
console.log('');

console.log('=== All Tests Complete ===');
