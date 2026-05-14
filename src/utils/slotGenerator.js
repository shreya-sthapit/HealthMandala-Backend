/**
 * Utility functions for generating appointment time slots
 */

/**
 * Convert time string (HH:MM or HH:mm) to minutes since midnight
 * @param {string} timeStr - Time in format "HH:MM" or "HH:mm"
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Convert minutes since midnight to time string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time in format "HH:MM"
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Generate time slots for a given time range, excluding break times
 * @param {string} startTime - Start time in "HH:MM" format
 * @param {string} endTime - End time in "HH:MM" format
 * @param {string} breakStart - Break start time in "HH:MM" format (optional)
 * @param {string} breakEnd - Break end time in "HH:MM" format (optional)
 * @param {number} slotDuration - Duration of each slot in minutes (default: 10)
 * @returns {Array<string>} Array of time slots in "HH:MM" format
 */
function generateTimeSlots(startTime, endTime, breakStart = null, breakEnd = null, slotDuration = 10) {
  const slots = [];
  
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const breakStartMinutes = breakStart ? timeToMinutes(breakStart) : null;
  const breakEndMinutes = breakEnd ? timeToMinutes(breakEnd) : null;
  
  let currentMinutes = startMinutes;
  
  while (currentMinutes < endMinutes) {
    // Check if current slot falls within break time
    const isInBreak = breakStartMinutes !== null && 
                      breakEndMinutes !== null && 
                      currentMinutes >= breakStartMinutes && 
                      currentMinutes < breakEndMinutes;
    
    if (!isInBreak) {
      slots.push(minutesToTime(currentMinutes));
    }
    
    currentMinutes += slotDuration;
  }
  
  return slots;
}

/**
 * Generate slots for a doctor's schedule on a specific date
 * @param {Object} doctor - Doctor object with schedule
 * @param {Date} date - Date for which to generate slots
 * @param {string} hospitalName - Hospital name to match schedule
 * @returns {Array<string>} Array of available time slots
 */
function generateDoctorSlots(doctor, date, hospitalName) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[date.getDay()];
  
  // Find hospital-specific schedule
  const hospitalSchedule = doctor.hospitalSchedules?.find(
    hs => hs.hospital?.trim().toLowerCase() === hospitalName?.trim().toLowerCase()
  );
  
  // Get schedule for the specific day
  const schedule = hospitalSchedule?.schedule || doctor.schedule || [];
  const daySchedule = schedule.find(s => s.day === dayName && s.active);
  
  if (!daySchedule) {
    return []; // Doctor not available on this day
  }
  
  // Check if doctor is on leave
  const isOnLeave = doctor.leaves?.some(leave => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    return date >= leaveStart && date <= leaveEnd;
  });
  
  if (isOnLeave) {
    return []; // Doctor is on leave
  }
  
  // Generate slots
  return generateTimeSlots(
    daySchedule.start,
    daySchedule.end,
    daySchedule.breakStart,
    daySchedule.breakEnd,
    10 // 10-minute slots
  );
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  generateTimeSlots,
  generateDoctorSlots
};
