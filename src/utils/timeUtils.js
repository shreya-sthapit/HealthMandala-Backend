const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const calculateTokens = (startTime, endTime, lunchStart, lunchEnd, slotMinutes = 30) => {
  const workMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
  const lunchMinutes = timeToMinutes(lunchEnd) - timeToMinutes(lunchStart);
  return Math.max(0, Math.floor((workMinutes - lunchMinutes) / slotMinutes));
};

module.exports = { timeToMinutes, calculateTokens };
