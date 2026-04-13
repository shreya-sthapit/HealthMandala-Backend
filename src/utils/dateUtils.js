// Parse date string as local date (avoids UTC timezone shift)
const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Get day name from date string
const getDayName = (dateStr) => {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const d = parseLocalDate(dateStr);
  return days[d.getUTCDay()];
};

module.exports = { parseLocalDate, getDayName };

// Check if a date falls within a leave period
const isOnLeave = (dateStr, leaves = []) => {
  const checkDate = parseLocalDate(dateStr);
  return leaves.some(leave => {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    return checkDate >= start && checkDate <= end;
  });
};

module.exports = { parseLocalDate, getDayName, isOnLeave };
