// Simple in-memory rate limiter for auth endpoints
const attempts = new Map();

const rateLimiter = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  attempts.set(key, record);

  if (record.count > maxAttempts) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
};

module.exports = rateLimiter;
