const twilio = require("twilio");

let client = null;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Only initialize if credentials are provided and valid
if (accountSid && authToken && accountSid.startsWith('AC')) {
  try {
    client = twilio(accountSid, authToken);
    console.log('Twilio client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Twilio:', error.message);
  }
} else {
  console.log('Twilio credentials not provided or invalid - SMS features disabled');
}

module.exports = client;
